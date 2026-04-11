import { execSync } from "child_process";
console.log(execSync("curl -s https://prepostagem.correios.com.br/public-resources/manuais/9_JSON_arquivo_obj_registrado_sem_codigo_registro_exemplo.json").toString());
