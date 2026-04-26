# Oncology Drug Research Agent

## Identity
You are a pharmaceutical research agent with knowledge of
a hypothetical cancer drug pipeline.
You answer questions about mechanisms of action, trial phases,
target patient populations, side effect profiles, and
comparative efficacy against existing treatments.
This data is entirely hypothetical and for research
simulation purposes only. Never provide medical advice.

## Model
provider: azure_openai
model: gpt-4o
deployment: gpt-4o
temperature: 0.2
max_iterations: 5

## Knowledge

### NX-7701 (Nexarafenib)
- drug_class: RAF/MEK dual inhibitor
- target_cancer: BRAF-mutant melanoma, colorectal
- mechanism: blocks RAF-MEK-ERK signalling cascade,
  suppressing tumour cell proliferation
- trial_phase: Phase III
- trial_name: NEXUS-301
- efficacy: 67% objective response rate vs 42% vemurafenib
- os_benefit: median OS 24.3 months vs 16.1 months
- key_side_effects: rash, fatigue, elevated liver enzymes
- dose: 400mg oral twice daily

### CX-2219 (Celoxanib)
- drug_class: selective CDK4/6 inhibitor
- target_cancer: HR+ HER2- breast cancer (second line)
- mechanism: arrests cell cycle at G1 phase by blocking
  CDK4/6-mediated Rb phosphorylation
- trial_phase: Phase II
- trial_name: CELOX-202
- efficacy: PFS 13.4 months vs 7.2 months palbociclib
- os_benefit: data immature, 18-month OS 78%
- key_side_effects: neutropenia, fatigue, nausea
- dose: 150mg oral once daily, 21 days on / 7 days off

### VX-4450 (Volasertinib)
- drug_class: bispecific antibody (PD-1 x TIGIT)
- target_cancer: non-small cell lung cancer, microsatellite stable
- mechanism: dual checkpoint blockade — releases PD-1 and TIGIT
  suppression simultaneously for enhanced T-cell activation
- trial_phase: Phase II
- trial_name: VOLARA-204
- efficacy: ORR 38% in PD-L1 low population (vs 12% pembrolizumab)
- os_benefit: 12-month OS 61% vs 44%
- key_side_effects: immune-related pneumonitis, colitis, fatigue
- dose: 800mg IV every 3 weeks

### MX-8832 (Metiximab)
- drug_class: ADC — anti-TROP2 antibody-drug conjugate
- target_cancer: triple-negative breast cancer, urothelial
- mechanism: TROP2-targeted delivery of SN-38 topoisomerase
  inhibitor payload directly to tumour cells
- trial_phase: Phase III
- trial_name: METRO-311
- efficacy: ORR 52% in TNBC (vs 26% chemotherapy)
- os_benefit: median OS 18.1 months vs 11.8 months
- key_side_effects: interstitial lung disease, neutropenia, alopecia
- dose: 10mg/kg IV days 1 and 8, every 21 days

### RX-5561 (Rezorafenib)
- drug_class: KRAS G12C covalent inhibitor (next-gen)
- target_cancer: KRAS G12C mutant NSCLC, pancreatic
- mechanism: irreversibly binds KRAS G12C in GDP-bound state,
  blocking RAS-effector interactions; overcomes sotorasib resistance
- trial_phase: Phase I/II
- trial_name: RAZOR-101
- efficacy: ORR 43% in sotorasib-refractory patients
- os_benefit: median PFS 8.2 months in pretreated population
- key_side_effects: hepatotoxicity, diarrhea, QTc prolongation
- dose: 240mg oral once daily with food

## Tools
- get_drug_info
- compare_drugs
- search_by_cancer_type
- search_by_mechanism
- get_trial_data
- list_all_drugs

## Input Schema
drug_query:
  type: string
  description: research question about hypothetical cancer drugs

## Output Schema
answer:
  type: string
drugs_referenced:
  type: list
trial_phases_referenced:
  type: list
disclaimer:
  type: string
  value: "This data is entirely hypothetical. Not for clinical use."

## Queue
name: cancer-drug-agent-tasks
max_wait_seconds: 30

## Heartbeat
interval_seconds: 30
endpoint: /agents/oncology-drug-agent/heartbeat
