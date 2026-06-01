use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt, copy_bidirectional};
use anyhow::{anyhow, Result};
use std::sync::Arc;
use crate::services::inference_client::InferenceClient;
use crate::services::config_service;

pub async fn start_interceptor() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:4566").await?;
    println!("Bedrock Interceptor listening on 127.0.0.1:4566");

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream).await {
                        println!("Error in Bedrock proxy connection: {}", e);
                    }
                });
            }
            Err(e) => {
                println!("Error accepting connection in interceptor: {}", e);
            }
        }
    }
}

async fn handle_connection(mut client_stream: TcpStream) -> Result<()> {
    let mut initial_buf = vec![0u8; 1024];
    let n = client_stream.read(&mut initial_buf).await?;
    if n == 0 {
        return Ok(());
    }
    initial_buf.truncate(n);

    // Convert headers to check path
    let request_head = String::from_utf8_lossy(&initial_buf);
    let is_bedrock = request_head.contains("/model/") || request_head.contains("/bedrock-runtime/");

    if is_bedrock {
        let (header, body) = read_full_request(&mut client_stream, &initial_buf).await?;
        let body_json: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
        let prompt = extract_prompt(&body_json);

        let model = config_service::load().map(|c| c.model).unwrap_or_else(|_| "llama3.2:3b".to_string());
        let client = InferenceClient::new(&model);
        
        let resp_json = match client.generate(&prompt).await {
            Ok(resp) => {
                serde_json::json!({
                    "completion": resp.text,
                    "inputTextTokenCount": resp.tokens_in,
                    "outputTextTokenCount": resp.tokens_out,
                    "output": {
                        "message": {
                            "content": [
                                { "text": resp.text }
                            ]
                        }
                    },
                    "results": [
                        { "outputText": resp.text }
                    ]
                })
            }
            Err(e) => {
                serde_json::json!({
                    "error": e.to_string(),
                    "completion": format!("Error generating response: {}", e)
                })
            }
        };

        let resp_str = resp_json.to_string();
        let http_response = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n\
             {}",
            resp_str.len(),
            resp_str
        );
        client_stream.write_all(http_response.as_bytes()).await?;
        client_stream.flush().await?;
    } else {
        // Proxy to Floci running on port 4568
        match TcpStream::connect("127.0.0.1:4568").await {
            Ok(mut floci_stream) => {
                floci_stream.write_all(&initial_buf).await?;
                let _ = copy_bidirectional(&mut client_stream, &mut floci_stream).await;
            }
            Err(e) => {
                // If Floci isn't running or connects fail, return an error HTTP response
                let err_body = format!("{{\"error\":\"Floci backend at 4568 unreachable: {}\"}}", e);
                let http_response = format!(
                    "HTTP/1.1 502 Bad Gateway\r\n\
                     Content-Type: application/json\r\n\
                     Content-Length: {}\r\n\
                     Connection: close\r\n\r\n\
                     {}",
                    err_body.len(),
                    err_body
                );
                let _ = client_stream.write_all(http_response.as_bytes()).await;
                let _ = client_stream.flush().await;
            }
        }
    }
    Ok(())
}

async fn read_full_request(stream: &mut TcpStream, initial_data: &[u8]) -> Result<(String, Vec<u8>)> {
    let mut request_data = initial_data.to_vec();
    let mut header_end = find_subsequence(&request_data, b"\r\n\r\n");
    
    // Read headers if not fully read
    while header_end.is_none() {
        let mut chunk = [0u8; 1024];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        request_data.extend_from_slice(&chunk[..n]);
        header_end = find_subsequence(&request_data, b"\r\n\r\n");
    }
    
    let header_end_idx = header_end.ok_or_else(|| anyhow!("Malformed HTTP headers"))?;
    let header_part = String::from_utf8_lossy(&request_data[..header_end_idx]).to_string();
    
    // Parse Content-Length
    let mut content_length = 0;
    for line in header_part.lines() {
        if line.to_lowercase().starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                content_length = val.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }
    
    let total_required = header_end_idx + 4 + content_length;
    while request_data.len() < total_required {
        let mut chunk = [0u8; 1024];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        request_data.extend_from_slice(&chunk[..n]);
    }
    
    let body = request_data[header_end_idx + 4..total_required.min(request_data.len())].to_vec();
    Ok((header_part, body))
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn extract_prompt(body: &serde_json::Value) -> String {
    if let Some(p) = body.get("prompt").and_then(|v| v.as_str()) {
        return p.to_string();
    }
    if let Some(t) = body.get("inputText").and_then(|v| v.as_str()) {
        return t.to_string();
    }
    if let Some(messages) = body.get("messages").and_then(|v| v.as_array()) {
        let mut prompt = String::new();
        for msg in messages {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            if let Some(content) = msg.get("content") {
                if let Some(arr) = content.as_array() {
                    for item in arr {
                        if let Some(txt) = item.get("text").and_then(|v| v.as_str()) {
                            prompt.push_str(&format!("{}: {}\n", role, txt));
                        }
                    }
                } else if let Some(txt) = content.as_str() {
                    prompt.push_str(&format!("{}: {}\n", role, txt));
                }
            }
        }
        if !prompt.is_empty() {
            return prompt;
        }
    }
    "".to_string()
}
