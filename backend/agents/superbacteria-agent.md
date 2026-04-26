# Super Bacteria Knowledge Agent

## Identity
You are a microbiology knowledge agent specializing in 10
dangerous antibiotic-resistant superbugs.
You answer factual questions about identification, resistance
mechanisms, transmission, and treatment options.
Never recommend specific treatment for individual patients.
Always cite WHO threat classification. If bacteria not in
your knowledge base, say so clearly.

## Model
provider: azure_openai
model: gpt-4o
deployment: gpt-4o
temperature: 0.1
max_iterations: 5

## Knowledge

### MRSA (Methicillin-resistant Staphylococcus aureus)
- who_priority: high
- resistance: methicillin, oxacillin, most beta-lactams
- transmission: skin contact, contaminated surfaces, hospitals
- symptoms: skin infections, pneumonia, bloodstream infections
- last_resort_treatment: vancomycin, daptomycin, linezolid
- mortality_rate: 15-50% if bloodstream infection

### CRE (Carbapenem-resistant Enterobacteriaceae)
- who_priority: critical
- resistance: carbapenems (last-resort antibiotics)
- transmission: person-to-person, contaminated equipment
- symptoms: UTI, pneumonia, bloodstream infections
- last_resort_treatment: ceftazidime-avibactam, colistin
- mortality_rate: up to 50%

### Acinetobacter baumannii (CRAB)
- who_priority: critical
- resistance: carbapenems, nearly pan-resistant strains exist
- transmission: ICU equipment, ventilators, wounds
- symptoms: pneumonia, wound infections, meningitis
- last_resort_treatment: colistin, tigecycline combination
- mortality_rate: 25-60% in ICU patients

### Pseudomonas aeruginosa (CRPA)
- who_priority: critical
- resistance: carbapenems, fluoroquinolones, aminoglycosides
- transmission: water sources, medical devices, burns units
- symptoms: lung infections, UTI, sepsis in immunocompromised
- last_resort_treatment: ceftolozane-tazobactam, cefiderocol
- mortality_rate: 30-60% in bloodstream infections

### VRE (Vancomycin-resistant Enterococcus)
- who_priority: high
- resistance: vancomycin (previously last resort)
- transmission: direct contact, contaminated surfaces
- symptoms: UTI, wound infections, endocarditis
- last_resort_treatment: linezolid, daptomycin
- mortality_rate: 25-75% in serious infections

### Clostridioides difficile (C. diff)
- who_priority: high
- resistance: fluoroquinolones, triggers post-antibiotic colitis
- transmission: fecal-oral, spores survive on surfaces for months
- symptoms: severe diarrhea, colitis, toxic megacolon
- last_resort_treatment: fidaxomicin, fecal microbiota transplant
- mortality_rate: 5-10%, higher in elderly

### Neisseria gonorrhoeae (XDR)
- who_priority: high
- resistance: penicillin, tetracycline, fluoroquinolones, cephalosporins
- transmission: sexual contact
- symptoms: urethritis, cervicitis, pelvic inflammatory disease
- last_resort_treatment: ceftriaxone + azithromycin dual therapy
- mortality_rate: low but major public health threat

### Streptococcus pneumoniae (PRSP)
- who_priority: high
- resistance: penicillin, macrolides, fluoroquinolones
- transmission: respiratory droplets
- symptoms: pneumonia, meningitis, sepsis
- last_resort_treatment: vancomycin + rifampicin for meningitis
- mortality_rate: 20-30% for invasive disease in elderly

### Haemophilus influenzae (ampicillin-resistant)
- who_priority: medium
- resistance: ampicillin via beta-lactamase production
- transmission: respiratory droplets
- symptoms: meningitis, pneumonia, epiglottitis in children
- last_resort_treatment: cefotaxime, ceftriaxone
- mortality_rate: 3-6% for meningitis with treatment

### Salmonella typhi (XDR)
- who_priority: high
- resistance: ampicillin, chloramphenicol, TMP-SMX, fluoroquinolones
- transmission: contaminated food and water
- symptoms: sustained fever, abdominal pain, rose spots
- last_resort_treatment: azithromycin, ceftriaxone
- mortality_rate: 1% with treatment, up to 30% untreated

## Tools
- get_bacteria_info
- search_by_resistance
- compare_bacteria
- list_all_bacteria
- get_treatment_options

## Input Schema
bacteria_query:
  type: string
  description: natural language question about superbugs

## Output Schema
answer:
  type: string
who_classifications_referenced:
  type: list
tool_calls_made:
  type: list

## Queue
name: superbacteria-agent-tasks
max_wait_seconds: 30

## Heartbeat
interval_seconds: 30
endpoint: /agents/superbacteria-agent/heartbeat
