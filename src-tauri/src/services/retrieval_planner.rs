use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum RetrievalStrategy {
    VectorOnly,
    GraphOnly,
    Hybrid,
    Keyword,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalPlan {
    pub query: String,
    pub strategy: RetrievalStrategy,
    pub storage_tier: String, // HOT | WARM | COLD
    pub latency_ms: u64,
    pub reasoning: String,
}

pub fn classify_query(query: &str) -> (RetrievalStrategy, String, String) {
    let q_lower = query.to_lowercase();
    
    // Heuristics mapping
    if q_lower.contains("connect") || q_lower.contains("relation") || q_lower.contains("lineage") || q_lower.contains("linked to") {
        (
            RetrievalStrategy::GraphOnly,
            "HOT".to_string(),
            "Query targets explicit entity connections and relationship linkages, selecting Graph traversal.".to_string()
        )
    } else if q_lower.contains("find exact") || q_lower.contains("keyword") || q_lower.contains("specific term") {
        (
            RetrievalStrategy::Keyword,
            "HOT".to_string(),
            "Query requests keyword match or exact terms, selecting BM25 / Keyword search.".to_string()
        )
    } else if q_lower.contains("summarize") || q_lower.contains("concept") || q_lower.contains("explain the context") {
        (
            RetrievalStrategy::Hybrid,
            "WARM".to_string(),
            "Query requires complex conceptual reasoning combining vector similarities and graph relations, selecting Hybrid routing.".to_string()
        )
    } else {
        (
            RetrievalStrategy::VectorOnly,
            "WARM".to_string(),
            "Standard conceptual query, selecting Vector semantic search.".to_string()
        )
    }
}

pub fn explain_retrieval(query: &str) -> serde_json::Value {
    let start = Instant::now();
    let (strategy, tier, reasoning) = classify_query(query);
    let latency_ms = start.elapsed().as_millis() as u64;

    json!(RetrievalPlan {
        query: query.to_string(),
        strategy,
        storage_tier: tier,
        latency_ms,
        reasoning,
    })
}

// Simple Reciprocal Rank Fusion (RRF) implementation for re-ranking results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f64,
    pub content: String,
}

pub fn rerank_results(vector_results: Vec<SearchResult>, graph_results: Vec<SearchResult>) -> Vec<SearchResult> {
    let mut ranks = HashMap::new();
    
    // Helper to add reciprocal ranks
    let mut add_ranks = |results: Vec<SearchResult>| {
        for (pos, res) in results.into_iter().enumerate() {
            let entry = ranks.entry(res.id.clone()).or_insert((0.0, res.content));
            entry.0 += 1.0 / (60.0 + (pos + 1) as f64); // RRF formula (constant k=60)
        }
    };

    use std::collections::HashMap;
    add_ranks(vector_results);
    add_ranks(graph_results);

    let mut merged: Vec<SearchResult> = ranks.into_iter()
        .map(|(id, (score, content))| SearchResult { id, score, content })
        .collect();

    // Sort by descending RRF score
    merged.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    merged
}
