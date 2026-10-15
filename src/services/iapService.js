import * as RNIap from 'react-native-iap';
import { Platform } from 'react-native';
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

export const SEAT_PRODUCT_IDS = Platform.select({
    ios: [
        'com.gomusafir.plan.seat_only',
        'com.gomusafir.plan.basic_pack',
        'com.gomusafir.plan.plus_pack',
        'com.gomusafir.plan.elite_wireless',
        'com.gomusafir.plan.seat.10',
        'com.gomusafir.plan.seat.5',
    ],
    android: [
        'com.gomusafir.plan.seat_only',
        'com.gomusafir.plan.basic_pack',
        'com.gomusafir.plan.plus_pack',
        'com.gomusafir.plan.elite_wireless',
        'com.gomusafir.plan.seat.10',
        'com.gomusafir.plan.seat.5',
    ],
    default: []
});

let purchaseUpdateSubscription = null;
let purchaseErrorSubscription = null;

/**
 * Connect to IAP service and set purchase listener
 */
export const connectIAP = async (onPurchaseSuccess, onPurchaseError) => {
    try {
        const connected = await RNIap.initConnection();
        if (!connected) throw new Error('Could not connect to the App Store. Please try again.');
        if (Platform.OS === 'ios') {
            try {
                await RNIap.clearTransactionIOS();
            } catch (clearErr) {
                console.warn("Failed to clear iOS transactions:", clearErr);
            }
        }
        try {
            await RNIap.fetchProducts({ skus: SEAT_PRODUCT_IDS });
        } catch (prodErr) {
            console.warn("Failed to fetch products on connection:", prodErr);
        }

        if (purchaseUpdateSubscription) purchaseUpdateSubscription.remove();
        if (purchaseErrorSubscription) purchaseErrorSubscription.remove();

        purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
            const receipt = purchase.transactionReceipt || purchase.purchaseToken || purchase.transactionId;
            if (receipt) {
                try {
                    const verifyAppleIAPReceipt = httpsCallable(functions, 'verifyAppleIAPReceipt');
                    const res = await verifyAppleIAPReceipt({
                        receipt: receipt,
                        productId: purchase.productId,
                        transactionId: purchase.transactionId || purchase.id,
                        quantity: purchase.quantity || 1,
                    });

                    if (res.data && res.data.success) {
                        await RNIap.finishTransaction({ purchase, isConsumable: true });
                        if (onPurchaseSuccess) onPurchaseSuccess(purchase, res.data);
                    } else {
                        if (onPurchaseError) onPurchaseError(new Error(res.data?.message || 'Verification failed'));
                    }
                } catch (err) {
                    console.error("IAP Receipt verification error:", err);
                    if (onPurchaseError) onPurchaseError(err);
                }
            }
        });

        purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
            console.warn('IAP error:', error);
            if (onPurchaseError) onPurchaseError(error);
        });
    } catch (err) {
        console.warn("connectIAP failed:", err);
        if (onPurchaseError) onPurchaseError(err);
    }
};

/**
 * Fetch products from App Store / Play Store
 */
export const getIAPProducts = async (productIds = SEAT_PRODUCT_IDS) => {
    try {
        const products = await RNIap.fetchProducts({ skus: productIds });
        return products || [];
    } catch (err) {
        console.warn("getIAPProducts failed:", err);
    }
    return [];
};

/**
 * Purchase item
 */
export const purchaseSeatProduct = async (productId, quantity = 1) => {
    try {
        if (!SEAT_PRODUCT_IDS.includes(productId)) {
            throw new Error(`Unknown purchase product: ${productId}`);
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new Error('Purchase quantity must be a positive whole number.');
        }
        // Confirm that this storefront actually exposes the requested product.
        // A missing product otherwise becomes a generic native purchase failure.
        const products = await RNIap.fetchProducts({ skus: [productId], type: 'in-app' });
        if (!products?.some(product => product.id === productId)) {
            throw new Error(`The App Store did not return product "${productId}". Please contact support with this product ID.`);
        }
        // RNIap v15 standard request structure
        await RNIap.requestPurchase({
            type: 'in-app',
            request: {
                apple: { sku: productId, quantity: quantity },
                google: { skus: [productId] },
            },
        });
    } catch (err) {
        console.error("purchaseSeatProduct error:", err);
        throw err;
    }
};

/**
 * Disconnect IAP listener
 */
export const disconnectIAP = async () => {
    try {
        if (purchaseUpdateSubscription) {
            purchaseUpdateSubscription.remove();
            purchaseUpdateSubscription = null;
        }
        if (purchaseErrorSubscription) {
            purchaseErrorSubscription.remove();
            purchaseErrorSubscription = null;
        }
        await RNIap.endConnection();
    } catch (err) {
        console.warn("disconnectIAP failed:", err);
    }
};
