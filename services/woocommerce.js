const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const config = require('../config/config');

class WooCommerceService {
    constructor() {
        this.api = new WooCommerceRestApi({
            url: config.woocommerce.url,
            consumerKey: config.woocommerce.consumerKey,
            consumerSecret: config.woocommerce.consumerSecret,
            version: config.woocommerce.version
        });
    }

    async getOrders(params = {}) {
        try {
            console.log('Fetching orders from WooCommerce with params:', params);
            const response = await this.api.get('orders', params);
            console.log(`Found ${response.data.length} orders`);
            return response.data;
        } catch (error) {
            console.error('Error fetching orders from WooCommerce:', error.response?.data || error.message);
            throw new Error('Errore nel recupero degli ordini da WooCommerce: ' + (error.response?.data?.message || error.message));
        }
    }

    async getOrder(orderId) {
        try {
            console.log('Fetching order details for ID:', orderId);
            const response = await this.api.get(`orders/${orderId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching order details from WooCommerce:', error.response?.data || error.message);
            throw new Error('Errore nel recupero dei dettagli ordine da WooCommerce: ' + (error.response?.data?.message || error.message));
        }
    }

    async updateOrder(orderId, data) {
        try {
            console.log('Updating order:', orderId, 'with data:', data);
            const response = await this.api.put(`orders/${orderId}`, data);
            return response.data;
        } catch (error) {
            console.error('Error updating order in WooCommerce:', error.response?.data || error.message);
            throw new Error('Errore nell\'aggiornamento dell\'ordine in WooCommerce: ' + (error.response?.data?.message || error.message));
        }
    }

    async verifyOrderEmail(orderId, email) {
        try {
            const order = await this.getOrder(orderId);
            return order.billing.email === email;
        } catch (error) {
            console.error('Errore nella verifica email:', error);
            return false;
        }
    }

    async getOrderItems(orderId) {
        try {
            const order = await this.getOrder(orderId);
            return order.line_items.map(item => ({
                id: item.product_id,
                name: item.name,
                quantity: item.quantity
            }));
        } catch (error) {
            console.error('Errore nel recupero prodotti:', error);
            throw new Error('Impossibile recuperare i prodotti dell\'ordine');
        }
    }
}

module.exports = new WooCommerceService(); 