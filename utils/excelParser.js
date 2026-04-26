const xlsx = require('xlsx');

const parseExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);

  const products = [];
  for (const row of data) {
    const keys = Object.keys(row);
    const partNoKey = keys.find(k => k.toLowerCase().includes('part') && k.toLowerCase().includes('no')) || keys[0];
    const descKey = keys.find(k => k.toLowerCase().includes('desc')) || keys[1];

    if (row[partNoKey] && row[descKey]) {
      products.push({
        partNo: String(row[partNoKey]).trim().toUpperCase(),
        description: String(row[descKey]).trim()
      });
    }
  }

  return products;
};

module.exports = { parseExcel };

