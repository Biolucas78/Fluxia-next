const fs = require('fs');
const data = fs.readFileSync('/app/swagger.json', 'utf8');
const swagger = JSON.parse(data);
console.log(JSON.stringify(swagger.components.schemas.PrePostagem, null, 2));
