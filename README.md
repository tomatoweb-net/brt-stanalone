# BRT Standalone Service

Servizio standalone per l'integrazione con l'API BRT (Bartolini) per la generazione di etichette di spedizione.

## Funzionalità

- Generazione etichette di spedizione

## Configurazione

Il servizio richiede un file `config/config.js` con le seguenti informazioni:

```javascript
module.exports = {
    bartolini: {
        userId: "YOUR_USER_ID",
        password: "YOUR_PASSWORD",
        companyName: "YOUR_COMPANY_NAME",
        address: "YOUR_ADDRESS",
        zipCode: "YOUR_ZIP",
        city: "YOUR_CITY"
    },
    pdfPath: "path/to/pdf/directory"
};
```

## Utilizzo

```javascript
const bartoliniService = require('./services/bartolini');

// Generare una nuova etichetta di spedizione
const result = await bartoliniService.generateLabel(orderData);
```

### Formato orderData

```javascript
const orderData = {
    company: "Nome Azienda", // opzionale
    firstName: "Nome",       // usato se company non è presente
    lastName: "Cognome",     // usato se company non è presente
    address: "Indirizzo di consegna",
    postcode: "12345",
    city: "Città",
    orderId: "123456"       // numero ordine
}; 