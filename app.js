const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const app = express();
const mysql = require('mysql2');
const methodOverride = require('method-override');


app.use(methodOverride('_method'));

// Andere middlewares zoals body-parser of session
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// MySQL-verbinding maken
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root', // Standaard MySQL-gebruiker
    password: '', // Leeg wachtwoord voor WAMP (standaardinstelling)
    database: 'retrospective',
});

db.connect(err => {
    if (err) {
        console.error('Kan geen verbinding maken met de database:', err);
    } else {
        console.log('Verbonden met de MySQL database!');
    }
});

module.exports = db;


// Configuraties
require('dotenv').config();


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'geheim',
    resave: false,
    saveUninitialized: true,
}));

// EJS Instellen
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use("/static", express.static(path.join(__dirname, "public")));

// Routes Importeren
const indexRoutes = require('./routes/index');
app.use('/', indexRoutes);

module.exports = app;

// Server Starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));
