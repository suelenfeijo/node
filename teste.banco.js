import pg from 'pg';

const { Client } = pg;

// Configuração dos bancos
const configBanco1 = {
  user: 'postgres',
  host: 'localhost',
  database: 'datasend',
  password: '3002',
  port: 5432,
};

const configBanco2 = {
  user: 'postgres',
  host: 'localhost',
  database: 'datasend_clone',
  password: '3002',
  port: 5432,
};

// Função para obter nome das tabelas e contagem de registros
async function getTabelasRegistros(client) {
  const queryTables = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `;

  const res = await client.query(queryTables);
  const tables = res.rows.map(row => row.table_name);

  let tableCounts = new Map();

  for (let table of tables) {
    const countQuery = `SELECT COUNT(*) AS count FROM "${table}";`;
    const countRes = await client.query(countQuery);
    tableCounts.set(table, parseInt(countRes.rows[0].count, 10));
  }

  return tableCounts;
}

// Comparar os bancos de dados
async function compararBancos() {
  const client1 = new Client(configBanco1);
  const client2 = new Client(configBanco2);

  await client1.connect();
  await client2.connect();

  console.log("Obtendo tabelas e contagens...");

  const banco1Counts = await getTabelasRegistros(client1);
  const banco2Counts = await getTabelasRegistros(client2);

  await client1.end();
  await client2.end();

  console.log("\n Comparação de tabelas:");
  let differences = false;

  const tabelasBanco1 = Array.from(banco1Counts.keys());
  const tabelasBanco2 = Array.from(banco2Counts.keys());

  const setBanco1 = new Set(tabelasBanco1);
  const setBanco2 = new Set(tabelasBanco2);

  const tabelasDiferentes = [
    ...tabelasBanco1.filter(table => !setBanco2.has(table)), 
    ...tabelasBanco2.filter(table => !setBanco1.has(table))
  ];
  
  if (tabelasDiferentes.length > 0) {
    console.error("\n Diferença nos nomes das tabelas:");
    tabelasDiferentes.forEach(table => console.error(`  - ${table} está presente em apenas um dos bancos`));
  
    
    throw new Error("Os nomes das tabelas são diferentes");
  } else {
    console.log("\n Os nomes das tabelas estão ok");
  }
  

  const allTables = new Set([...tabelasBanco1, ...tabelasBanco2]);

  let totalBanco1 = 0;
  let totalBanco2 = 0;

  console.log("\n Comparação de contagens:");
  allTables.forEach(table => {
    const count1 = banco1Counts.get(table) || 0;
    const count2 = banco2Counts.get(table) || 0;

    if (count1 !== count2) {
      console.log(`   Diferença na tabela "${table}": DataSend(${count1}) vs DataSend Clone(${count2})`);
      differences = true;
    } else {
      console.log(`   Tabela "${table}" está equivalente: ${count1} registros`);
    }

    totalBanco1 += count1;
    totalBanco2 += count2;
  });

  console.log(`\n  Total de registros no banco DataSend: ${totalBanco1}`);
  console.log(`  Total de registros no Banco DataSend Clone: ${totalBanco2}`);

  if (!differences) {
    console.log("\n  Todos os dados estão iguais nos dois bancos!");
  }
}

// Executar a comparação
compararBancos().catch(err => console.error("Erro ao comparar bancos:", err));
