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
        await RNIap.initConnection();
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
            if (onPurchaseError) onPurchaseError(new Error(error.message || 'IAP Error'));
        });
    } catch (err) {
        console.warn("connectIAP failed:", err);
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
        // RNIap v15 standard request structure
        await RNIap.requestPurchase({
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
