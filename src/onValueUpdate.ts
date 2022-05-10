import * as functions from "firebase-functions";
import { firestore } from "firebase-admin";
import { convertIntoListOfCurrencies } from './utils/convert';
import { uniq, set } from 'lodash'
import { DataType, CashSeriesType } from './types';
import { impactCashByValue } from './utils/calculations';

export const onValueUpdate = functions.firestore
    .document('users/{userId}/portfolios/{portfolioId}/accounts/{accountId}/values/{valueId}')
    .onWrite(async (change, context) => {
        const after = change.after.data();
        const data: DataType = {
            after: {
                date: after?.date,
                amount: after?.amount,
                created: after?.created,
                currency: after?.currency,
                createdFrom: after?.createdFrom,
            },
            params: {
                userId: context.params.userId,
                portfolioId: context.params.portfolioId,
                accountId: context.params.accountId,
                valueId: context.params.valueId,
            },
        }
        await treatAccount(data.params.portfolioId, data);
        return 'done';
    });
/*{
    non-performing

    1. find previous series
    2. if does not exist - initialize with value and metrics 0
    3. if value != previous value -> increase Income or Increase spending by the difference
    4. Save series
    conditional: if there are series after
    5. delete all the series after
    6. load values and transactions after and recalculate series
    7. save future series
    
    performing

    1. Load the Series on the day of previous Value
    2. find transactions that come after that series
    3. calculate value and other metrics
    4. Save series
}*/
const treatAccount = async (pfType: string, data: DataType) => {
    console.log('treating account');
    const userCurrency = await getUserCurrency(data.params.userId);
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency, data.after.currency]);

    // nonperforming
    if (pfType === 'nonperforming') {
        const previousSeries = await findPreviousSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId
        });
        if (previousSeries?.length) {
            const newSeries = await impactCashByValue(previousSeries[0].data(), data.after, listOfCurrencies);
            try {
                const newSeriesRef = await firestore()
                    .collection('users')
                    .doc(data.params.userId)
                    .collection('portfolios')
                    .doc(data.params.portfolioId)
                    .collection('accounts')
                    .doc(data.params.accountId)
                    .collection('series')
                    .add(newSeries)
                console.log('Saved new series', newSeriesRef.id)
            } catch (e) {
                console.log('error saving new series', e)
            }
        } else {
            // initialize first series
            console.log('no previous series found, initializing...')
            const amount = await convertIntoListOfCurrencies(data.after.amount, data.after.currency, listOfCurrencies, data.after.date);
            const zeros = {};
            listOfCurrencies.forEach(ccy => {
                set(zeros, `${ccy}`, '0');
            })
            const newSeries: CashSeriesType = {
                date: data.after.date,
                amount,
                income: zeros,
                spending: zeros,
                createdFrom: 'value'
            }
            try {
                const newSeriesRef = await firestore()
                    .collection('users')
                    .doc(data.params.userId)
                    .collection('portfolios')
                    .doc(data.params.portfolioId)
                    .collection('accounts')
                    .doc(data.params.accountId)
                    .collection('series')
                    .add(newSeries)
                console.log('Initialized first series', newSeriesRef.id)
            } catch (e) {
                console.log('error saving first series', e)
            }
        }
    }
}

const findPreviousSeries = async ({ date, userId, pfId, accountId }:
    { date: string, userId: string, pfId: string, accountId: string }) => {
    let res;
    try {
        const prevSeriesRef = firestore()
            .collection('users')
            .doc(userId)
            .collection('portfolios')
            .doc(pfId)
            .collection('accounts')
            .doc(accountId)
            .collection('series')
            .where('date', '<=', date)
            .orderBy('date', 'desc')
            // .orderBy('created', 'desc') // TODO - enable later - probably needs an index
            .limit(1)
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

const getUserCurrency = async (userId: string) => {
    let currency;
    const userRef = firestore()
        .collection('users')
        .doc(userId)
    try {
        const user = await userRef.get();
        const data = user.data();
        currency = data?.currency;
    } catch (e) {
        console.error('Error fetching user settings', e);
    }
    return currency;
}