import { firestore } from "firebase-admin";
import { multiply, divide, round } from 'mathjs';
import { set } from 'lodash';

export async function convert(amount: any, fromCcy: any, toCcy: any, date: any) {
    const pair1 = { from: '', to: '', invert: false };
    const pair2 = { from: '', to: '', invert: false, used: false };
    let rate1;
    let rate2 = 1;
    if (fromCcy === toCcy) {
        return amount;
    } else if (fromCcy === 'EUR' || fromCcy === 'USD') {
        pair1.from = fromCcy;
        pair1.to = toCcy
    } else if (toCcy === 'EUR' || toCcy === 'USD') {
        pair1.from = toCcy;
        pair1.to = fromCcy;
        pair1.invert = true;
    } else {
        pair1.from = 'EUR';
        pair1.to = fromCcy;
        pair1.invert = true;
        pair2.from = 'EUR';
        pair2.to = toCcy;
        pair2.used = true;
    }
    const rate1Ref = firestore().collection('exchange_rates').doc(pair1.from).collection(pair1.to);
    const q1 = rate1Ref.orderBy('date', 'desc').where('date', '<=', date).limit(1);
    try {
        const values = await q1.get();
        let docs: any[] = [];
        values.forEach(doc => {
            docs = [...docs, { ...doc.data() }];
        });
        rate1 = docs.length ? docs[0].rate : 1;
    } catch (e) {
        console.error('Error rate 1', e);
    }
    if (pair2.used) {
        const rate2Ref = firestore().collection('exchange_rates').doc(pair2.from).collection(pair2.to);
        const q2 = rate2Ref.orderBy('date', 'desc').where('date', '<=', date).limit(1);
        try {
            const values = await q2.get();
            let docs: any[] = [];
            values.forEach(doc => {
                docs = [...docs, { ...doc.data() }];
            });
            rate2 = docs.length ? docs[0].rate : 1;
        } catch (e) {
            console.error('Error rate 2', e);
        }
    }
    const multiplier1 = pair1.invert ? divide(1, rate1) : rate1;
    const multiplier2 = pair2.used ? (pair2.invert ? divide(1, rate2) : rate2) : 1;
    const result = round(multiply(multiply(amount, multiplier1), multiplier2), 2);
    return result;
}

export async function convertIntoListOfCurrencies(amount: string, fromCcy: string, listOfCurrencies: any[], date: string) {
    const res = {};
    for (let index = 0; index < listOfCurrencies.length; index++) {
        const converted = await convert(amount, fromCcy, listOfCurrencies[index], date);
        set(res, `${listOfCurrencies[index]}`, converted);
    }
    return res;
}