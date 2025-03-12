const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const config = require('./config/config');

// Inizializzazione Express
const app = express();

// Configurazione middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'bartolini-returns-secret',
    resave: false,
    saveUninitialized: true
}));

// Creazione cartelle necessarie se non esistono
const dirs = [
    path.dirname(config.dataPath),
    path.dirname(config.shipmentsPath),
    config.pdfPath
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Creazione file returns.json se non esiste
if (!fs.existsSync(config.dataPath)) {
    fs.writeFileSync(config.dataPath, '[]', 'utf8');
}

// Creazione file shipments.json se non esiste
if (!fs.existsSync(config.shipmentsPath)) {
    fs.writeFileSync(config.shipmentsPath, '[]', 'utf8');
}

// Routes
const adminRoutes = require('./routes/admin');
const returnsRoutes = require('./routes/returns');
const shippingRoutes = require('./routes/shipping');

app.use('/admin', adminRoutes);
app.use('/returns', returnsRoutes);
app.use('/shipping', shippingRoutes);

// Homepage
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Sistema Resi Bartolini'
    });
});

// Gestione errori
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Si è verificato un errore',
        error: err
    });
});

// Avvio server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
}); 