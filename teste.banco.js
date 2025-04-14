import pg from 'pg';

const { Client } = pg;

// Configuração dos bancos
// Configuração dos bancos
const configBanco1 = {
  user: 'postgres',
  host: 'localhost',
  database: 'db_mirror_datasend_production',
  password: '1234',
  port: 5432,
};

const configBanco2 = {
  user: 'datapriority',
  host: "dbdatasend.ctlfijktiecd.us-east-1.rds.amazonaws.com",
  database: 'datasendAWS',
  password: '2GuAWJDjp8IqEd7I2X7L',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
};

async function getTabelasRegistros(client) {
  try {
    const queryTables = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `;

    const res = await client.query(queryTables);
    const tables = res.rows.map(row => row.table_name);

    let tableCounts = new Map();

    for (let table of tables) {
      try {
        const countQuery = `SELECT COUNT(*) AS count FROM "${table}";`;
        const countRes = await client.query(countQuery);
        tableCounts.set(table, parseInt(countRes.rows[0].count, 10));
      } catch (err) {
        throw new Error(`Erro ao contar registros da tabela "${table}": ${err.message}`);
      }
    }

    return tableCounts;
  } catch (err) {
    throw new Error(`Erro ao obter tabelas: ${err.message}`);
  }
}

async function compararDadosTabela(client1, client2, tabela) {
  try {
    const query = `SELECT * FROM "${tabela}" ORDER BY 1`;
    const res1 = await client1.query(query);
    const res2 = await client2.query(query);

    if (res1.rows.length !== res2.rows.length) {
      throw new Error(`Tabela "${tabela}": número de linhas diferente (${res1.rows.length} vs ${res2.rows.length})`);
    }

    for (let i = 0; i < res1.rows.length; i++) {
      const row1 = JSON.stringify(res1.rows[i]);
      const row2 = JSON.stringify(res2.rows[i]);

      if (row1 !== row2) {
        throw new Error(
          `Diferença nos dados da tabela "${tabela}" na linha ${i + 1}\n` +
          `  Banco 1: ${row1}\n  Banco 2: ${row2}`
        );
      }
    }

    return true;
  } catch (err) {
    throw new Error(`Erro ao comparar dados da tabela "${tabela}": ${err.message}`);
  }
}

async function compararBancos() {
  const client1 = new Client(configBanco1);
  const client2 = new Client(configBanco2);

  try {
    await client1.connect();
    await client2.connect();
  } catch (err) {
    throw new Error(`Erro ao conectar com os bancos: ${err.message}`);
  }

  console.log("Obtendo tabelas e contagens...");

  let banco1Counts, banco2Counts;
  try {
    banco1Counts = await getTabelasRegistros(client1);
    banco2Counts = await getTabelasRegistros(client2);
  } catch (err) {
    throw new Error(`Erro ao obter contagens: ${err.message}`);
  }

  console.log("\n Comparação de tabelas:");
  let errors = [];

  const tabelasBanco1 = Array.from(banco1Counts.keys());
  const tabelasBanco2 = Array.from(banco2Counts.keys());

  const setBanco1 = new Set(tabelasBanco1);
  const setBanco2 = new Set(tabelasBanco2);

  const tabelasDiferentes = [
    ...tabelasBanco1.filter(table => !setBanco2.has(table)),
    ...tabelasBanco2.filter(table => !setBanco1.has(table))
  ];

  if (tabelasDiferentes.length > 0) {
    const erro = tabelasDiferentes.map(table => `Tabela "${table}" está presente em apenas um dos bancos`).join('\n');
    throw new Error(`Diferença nos nomes das tabelas:\n${erro}`);
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
      errors.push(`Diferença na contagem da tabela "${table}": DataSend(${count1}) vs Clone(${count2})`);
    } else {
      console.log(`   Tabela "${table}" está equivalente: ${count1} registros`);
    }

    totalBanco1 += count1;
    totalBanco2 += count2;
  });

  console.log(`\n  Total de registros no banco DataSend: ${totalBanco1}`);
  console.log(`  Total de registros no Banco DataSend Clone: ${totalBanco2}`);

  console.log("\n Comparando os dados linha a linha:");
  for (const tabela of tabelasBanco1) {
    try {
      const dadosIguais = await compararDadosTabela(client1, client2, tabela);
      if (dadosIguais) {
        console.log(`   ✅ Tabela "${tabela}" tem dados iguais`);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  await client1.end();
  await client2.end();

  if (errors.length > 0) {
    throw new Error(`Foram encontradas diferenças entre os bancos:\n\n${errors.join('\n')}`);
  }

  console.log("\n  ✅ Todos os dados estão iguais nos dois bancos!");
}

compararBancos().catch(err => {
  console.error("\n❌ Erro ao comparar bancos:");
  console.error(err.message);
});
