const pool = require("./connection");

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Connection error:', err);
    } else {
        console.log('Connection successful. Current time:', res.rows[0].now);
    }
    pool.end();
});