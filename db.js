const mysql = require("mysql2/promise");
const { db } = require("./config.json");

const pool = mysql.createPool(db);
module.exports = pool;
