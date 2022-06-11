import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import * as _ from "lodash";
import { firestore } from "firebase-admin";
import { addDays, formatISO, parseISO } from "date-fns";
import { onValueCreate } from './onValueCreate';
import { onTransactionCreate } from './onTransactionCreate';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();

const createDatesArray = (fromDate: any, toDate: any) => {
    const dates = [fromDate];
    let d = formatISO(addDays(parseISO(fromDate), 1), { representation: 'date' });
    while (d !== toDate) {
        dates.push(d)
        d = formatISO(addDays(parseISO(d), 1), { representation: 'date' });
    }
    dates.push(toDate);
    return dates;
}

export const onValueCreateFunction = onValueCreate;
export const onTransactionCreateFunction = onTransactionCreate;

exports.createExchangeRates = functions.https.onRequest(async (req, res) => {
    const base = req.query.base;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const requestURL = `https://api.exchangerate.host/timeseries?start_date=${fromDate}&end_date=${toDate}&base=${base}`;
    let data: any;
    const datesArray: any[] = createDatesArray(fromDate, toDate);
    functions.logger.info("datesArray - logger", datesArray, { structuredData: true });
    try {
        ({ data } = await axios.get(requestURL));
    } catch (error) {
        console.log("error", error);
    }

    if (data.success) {
        for (let index = 0; index < datesArray.length; index++) {
            const writeBatch = firestore().batch();
            _.forOwn(data.rates[datesArray[index]], (value, key) => {
                const doc = { rate: value, date: datesArray[index] };
                const docRef = firestore()
                    .collection("exchange_rates")
                    .doc(`${base}`)
                    .collection(`${key}`)
                    .doc();
                writeBatch.set(docRef, doc);
            });
            await writeBatch.commit();
        }
    }
    res.json({ result: `created exchange rates for ${base} from ${fromDate} to ${toDate}` });
});

exports.createCurrencyList = functions.https
    .onRequest(async (req, res) => {
        const requestURL = `https://api.exchangerate.host/symbols`;
        let data: any;
        try {
            ({ data } = await axios.get(requestURL));
        } catch (error) {
            console.log("error", error);
        }
        const writeBatch = firestore().batch();
        if (data.success) {
            _.forOwn(data.symbols, (value, key) => {
                const docRef = firestore()
                    .collection("currencies").doc(`${key}`);
                writeBatch.set(docRef, { description: value.description, code: value.code });
            });
        }
        await writeBatch.commit();
        res.json({ result: 'created list of exchange rates' });
    })