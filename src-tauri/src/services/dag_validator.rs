use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct WorkflowDef {
    #[serde(default)]
    steps: Vec<StepDef>,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct StepDef {
    name: String,
    _action: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    bucket: Option<String>,
    #[serde(default)]
    key: Option<String>,
}

pub fn validate_workflow_dag(yaml: &str) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // 1. Parse YAML structure
    let parsed: WorkflowDef = match serde_yaml::from_str(yaml) {
        Ok(def) => def,
        Err(e) => {
            errors.push(format!("YAML parsing failed: {}", e));
            return ValidationResult { is_valid: false, errors, warnings };
        }
    };

    if parsed.steps.is_empty() {
        errors.push("Workflow must contain at least one step.".to_string());
        return ValidationResult { is_valid: false, errors, warnings };
    }

    // 2. Build graph nodes
    let mut steps_map = HashMap::new();
    let mut adjacency_list: HashMap<String, HashSet<String>> = HashMap::new();
    let mut in_degrees: HashMap<String, usize> = HashMap::new();

    for step in &parsed.steps {
        if steps_map.insert(step.name.clone(), step.clone()).is_some() {
            errors.push(format!("Duplicate step name detected: '{}'", step.name));
        }
        adjacency_list.insert(step.name.clone(), HashSet::new());
        in_degrees.insert(step.name.clone(), 0);
    }

    if !errors.is_empty() {
        return ValidationResult { is_valid: false, errors, warnings };
    }

    // 3. Extract dependencies (edges)
    let re = regex::Regex::new(r"\{\{steps\.([a-zA-Z0-9_\-]+)\.output\}\}").unwrap();

    for step in &parsed.steps {
        let mut deps = HashSet::new();

        // Scan fields for dependencies
        let fields = vec![&step.prompt, &step.url, &step.data, &step.bucket, &step.key];
        for field in fields {
            if let Some(ref text) = field {
                for cap in re.captures_iter(text) {
                    if let Some(m) = cap.get(1) {
                        let dep_name = m.as_str().to_string();
                        if steps_map.contains_key(&dep_name) {
                            deps.insert(dep_name);
                        } else {
                            errors.push(format!(
                                "Step '{}' references undefined dependency step: '{}'",
                                step.name, dep_name
                            ));
                        }
                    }
                }
            }
        }

        // Add directed edges: dep_name -> step.name
        for dep in deps {
            adjacency_list.get_mut(&dep).unwrap().insert(step.name.clone());
            *in_degrees.get_mut(&step.name).unwrap() += 1;
        }
    }

    if !errors.is_empty() {
        return ValidationResult { is_valid: false, errors, warnings };
    }

    // 4. Cycle Detection using Kahn's Algorithm
    let mut queue = VecDeque::new();
    for (node, &degree) in in_degrees.iter() {
        if degree == 0 {
            queue.push_back(node.clone());
        }
    }

    let mut visited_count = 0;
    let mut sorted_order = Vec::new();

    while let Some(node) = queue.pop_front() {
        visited_count += 1;
        sorted_order.push(node.clone());

        if let Some(neighbors) = adjacency_list.get(&node) {
            for neighbor in neighbors {
                let degree = in_degrees.get_mut(neighbor).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    queue.push_back(neighbor.clone());
                }
            }
        }
    }

    if visited_count != steps_map.len() {
        errors.push("Circular dependency cycle detected in workflow DAG. Cycle path involves unresolved steps.".to_string());
        return ValidationResult { is_valid: false, errors, warnings };
    }

    // 5. Detect Unreachable / Orphaned nodes
    // Starts are nodes that have zero in-degrees in the original graph configuration
    let start_nodes: Vec<String> = in_degrees.keys()
        .filter(|&k| *in_degrees.get(k).unwrap() == 0)
        .cloned()
        .collect();

    // Trace reachability from start nodes
    let mut reachable = HashSet::new();
    let mut visit_queue = VecDeque::new();
    for start in &start_nodes {
        visit_queue.push_back(start.clone());
        reachable.insert(start.clone());
    }

    while let Some(node) = visit_queue.pop_front() {
        if let Some(neighbors) = adjacency_list.get(&node) {
            for neighbor in neighbors {
                if reachable.insert(neighbor.clone()) {
                    visit_queue.push_back(neighbor.clone());
                }
            }
        }
    }

    for step_name in steps_map.keys() {
        if !reachable.contains(step_name) {
            warnings.push(format!("Unreachable node detected: '{}' has no path from starting inputs.", step_name));
        }
    }

    let is_valid = errors.is_empty();
    ValidationResult { is_valid, errors, warnings }
}
