const fs = require('fs');
const swagger = JSON.parse(fs.readFileSync('swagger.json', 'utf8'));
const schemas = swagger.components?.schemas || swagger.definitions || {};
console.log(Object.keys(schemas));
