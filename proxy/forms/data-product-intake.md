---
title: Data Product Intake
description: Capture the information needed to assess a new or enhanced data product request.
fields:
  - name: requestType
    type: choice
    label: Request type
    options:
      - New data product
      - New data product proof of concept
      - Enhancement
      - Report issue
      - Request retirement
    required: true
    help: Choose the outcome the requester needs.
    agentInstruction: Confirm that the request type matches the user's intended outcome before proceeding.
  - name: productName
    type: text
    label: Data product name
    required: true
    help: Use a short, descriptive working name.
    agentInstruction: Suggest a concise name only when the requester has not supplied one.
  - name: businessNeed
    type: multiline
    label: Business need
    required: true
    help: Describe the decision, process, or outcome the data product will improve.
    agentInstruction: Identify the user problem, affected consumers, and measurable business value. Mark assumptions for user confirmation.
  - name: dataDomain
    type: text
    label: Data domain
    required: true
    help: Name the accountable business or data domain.
    agentInstruction: Propose a domain only from supplied evidence; otherwise leave it open for confirmation.
  - name: sourceSystems
    type: multiline
    label: Candidate source systems
    help: List known or likely source systems, datasets, or owners.
    agentInstruction: Separate confirmed sources from candidates and explain uncertainty.
  - name: successCriteria
    type: multiline
    label: Success criteria
    help: Define how the request will be considered successful.
    agentInstruction: Turn stated objectives into observable, measurable outcomes where possible.
---
# Data Product Intake

## Request

- **Request type:** {{requestType}}
- **Data product:** {{productName}}
- **Data domain:** {{dataDomain}}

## Business Need

{{businessNeed}}

## Candidate Source Systems

{{sourceSystems}}

## Success Criteria

{{successCriteria}}
