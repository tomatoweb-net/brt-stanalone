# BRT Standalone Service

Servizio standalone per l'integrazione con l'API BRT (Bartolini) per la generazione di etichette di spedizione e resi.

## Funzionalità

- Generazione etichette di spedizione
- Generazione etichette di reso
- Recupero etichette per spedizioni esistenti

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

// Generare un'etichetta di reso
const returnResult = await bartoliniService.generateReturnLabel(orderData);

// Recuperare un'etichetta esistente
const existingLabel = await bartoliniService.getShipmentLabel(parcelID, orderId);
``` 