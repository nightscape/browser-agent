---
description: "Test page helper"
url: http://test-target.local/**
elements:
  search_input:
    selector: "[data-testid='search']"
  submit_btn:
    selector: "#submit"
actions:
  search:
    description: "Search for items"
    parameters:
      - query: string
    steps:
      - fill: search_input
        with: "${query}"
      - click: submit_btn
  read_results:
    description: "Read search results"
    steps:
      - read: "#results-area"
---
You are a helper for the test page.
