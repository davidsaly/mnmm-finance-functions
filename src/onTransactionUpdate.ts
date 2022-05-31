import * as functions from "firebase-functions";
import { firestore } from "firebase-admin";
import { uniq } from 'lodash'
import { TransactionDataType, CashSeriesType, InvestmentSeriesType, ValueDataType } from './types';
import { impactCashByTransaction, impactInvestmentByTransaction, createAccountsAggregation } from './utils/calculations';
import { findPreviousSeries, getUserCurrency, findPreviousPortfolioSeries } from "./utils/dataCalls";
import { initialCashSeries, initialInvestmentSeries } from "./utils/utils";
import { updateJob } from "./utils/utils";

export const onTransactionCreate = functions.firestore
    .document('users/{userId}/portfolios/{portfolioId}/accounts/{accountId}/transactions/{transactionId}')
    .onCreate(async (snapshot, context) => {
        const after = snapshot.data();
        const data: TransactionDataType = {
            after: {
                date: after?.date,
                amount: after?.amount,
                created: after?.created,
                currency: after?.currency,
                flow: after?.flow,
                type: after?.type,
            },
            params: {
                userId: context.params.userId,
                portfolioId: context.params.portfolioId,
                accountId: context.params.accountId,
                transactionId: context.params.valueId,
            },
        }
        const userCurrency = await getUserCurrency(data.params.userId);
        await updateJob(data.params.userId, true);
        await treatAccount(data.params.portfolioId, data, userCurrency);
        await treatPortfolioCash(data.params.portfolioId, data, userCurrency);
        await treatPortfolioInvestment(data.params.portfolioId, data, userCurrency);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await updateJob(data.params.userId, false);
        return 'done';
    });
/*{
    cash - non-performing

    1. find previous series
    2. if does not exist - update value and metrics
    3. if exists - update value and metrics
    4. Save series
    conditional: if there are series after
    5. delete all the series after
    6. load values and transactions after and recalculate series
    7. save future series
    
    investment - performing

    1. Load previous series
    2. calculate value and other metrics
    3. Save series
}*/

const treatAccount = async (pfType: string, data: TransactionDataType, userCurrency: string) => {
    console.log('Transaction updated: treating account');
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency, data.after.currency]);

    // nonperforming
    if (pfType === 'nonperforming') {
        const previousSeries = await findPreviousSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId,
            dateEquality: '<='
        });
        const zeroSeries = initialCashSeries(listOfCurrencies, data.after.date, data.after.created, 'transaction');
        const previous: any = previousSeries?.length ? previousSeries[0].data() : zeroSeries;
        const initial: boolean = previousSeries?.length ? false : true;
        const newSeries: CashSeriesType = await impactCashByTransaction(previous, data.after, listOfCurrencies, initial);
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
            console.log('Created series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving series', e)
        }
    } else if (pfType === 'performing') {
        const previousSeries = await findPreviousSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId,
            dateEquality: '<=',
        });
        const zeroSeries = initialInvestmentSeries(listOfCurrencies, data.after.date, data.after.created, 'initial');
        const previous: any = previousSeries?.length ? previousSeries[0].data() : zeroSeries;
        const initial: boolean = previousSeries?.length ? false : true;
        const newSeries: InvestmentSeriesType = await impactInvestmentByTransaction(previous, data.after, listOfCurrencies, initial);
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
            console.log('Created series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving series', e)
        }
    }
}
/*
(has to run after treatAccount)
    non-performing
        - find the most recent series from every account
        - aggregate account series into portfolio series
*/
export const treatPortfolioCash = async (pfType: string, data: TransactionDataType | ValueDataType, userCurrency: string) => {
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency]);
    if (pfType === 'nonperforming') {
        const aggregate = await createAccountsAggregation(data.params.userId, data.params.portfolioId, data.after.date, listOfCurrencies, pfType);
        try {
            const newSeriesRef = await firestore()
                .collection('users')
                .doc(data.params.userId)
                .collection('portfolios')
                .doc(data.params.portfolioId)
                .collection('series')
                .add(aggregate)
            console.log('Created portfolio cash series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving portfolio cash series', e)
        }
    }
}
/*
performing
    impact the previous portfolio series
*/
const treatPortfolioInvestment = async (pfType: string, data: TransactionDataType, userCurrency: string) => {
    if (pfType === 'performing') {
        const listOfCurrencies = uniq(['EUR', 'USD', userCurrency]);
        const previousSeries = await findPreviousPortfolioSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            dateEquality: '<=',
        });
        const zeroSeries = initialInvestmentSeries(listOfCurrencies, data.after.date, data.after.created, 'initial');
        const previous: any = previousSeries?.length ? previousSeries[0].data() : zeroSeries;
        const initial: boolean = previousSeries?.length ? false : true;
        const newSeries: InvestmentSeriesType = await impactInvestmentByTransaction(previous, data.after, listOfCurrencies, initial);
        try {
            const newSeriesRef = await firestore()
                .collection('users')
                .doc(data.params.userId)
                .collection('portfolios')
                .doc(data.params.portfolioId)
                .collection('series')
                .add(newSeries)
            console.log('Created portfolio investment series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving portfolio investment series', e)
        }
    }
}