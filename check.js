const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const queries = [
'scenario-title', 'scenario-count', 'scenario-risk', 'scenario-prompt',
'ai-answer', 'answer-status', 'generate-answer-button', 'reference-note',
'reference-box', 'reference-toggle', 'study-form', 'trust-range', 
'safety-range', 'confidence-range', 'trust-value', 'safety-value', 
'confidence-value', 'reflection', 'submit-button', 'avg-trust', 
'avg-safety', 'avg-confidence', 'responses-list', 'response-count', 
'export-csv-button', 'export-pdf-button', 'reset-button'
];
queries.forEach(id => {
  if (!html.includes('id="' + id + '"')) {
    console.log('Missing HTML ID:', id);
  }
});
