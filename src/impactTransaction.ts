import { firestore } from "firebase-admin";
import { uniq, merge } from 'lodash'
import { TransactionDataType, CashSeriesType, InvestmentSeriesType, ValueDataType } from './types';
import { impactCashByTransaction, impactInvestmentByTransaction, createAccountsAggregation } from './utils/calculations';
import { findPreviousSeries, findPreviousPortfolioSeries } from "./utils/dataCalls";
import { initialCashSeries, initialInvestmentSeries } from "./utils/utils";

export const treatAccount = async (pfType: string, data: TransactionDataType, userCurrency: string, createdFromRef: any, previousAccountSeries: any) => {
    console.log('Transaction updated: treating account');
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency, data.after.currency]);
    const previousSeries = previousAccountSeries ? [previousAccountSeries] : await findPreviousSeries({
        date: data.after.date,
        userId: data.params.userId,
        pfId: data.params.portfolioId,
        accountId: data.params.accountId,
        dateEquality: '<='
    });
    // nonperforming
    if (pfType === 'nonperforming') {
        const zeroSeries = initialCashSeries(listOfCurrencies, data.after.date, data.after.created, 'transaction');
        const previous: any = previousSeries?.length ? previousSeries[0].data() : zeroSeries;
        console.log('previous', previous);
        console.log('data.after', data.after);
        const initial: boolean = previousSeries?.length ? false : true;
        const previousRef = previousSeries?.length ? previousSeries[0].ref : 'na';
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
                .add(merge(newSeries, { createdFromRef, nextRef: 'na', previousRef }))
            console.log('Created series', newSeriesRef.id);
            const newRef = newSeriesRef;
            if (previousRef !== 'na') {
                await firestore().doc(previousRef.path).update({ nextRef: newRef });
            }
        } catch (e) {
            console.log('Error saving series', e)
        }
    } else if (pfType === 'performing') {
        const zeroSeries = initialInvestmentSeries(listOfCurrencies, data.after.date, data.after.created, 'initial');
        const previous: any = previousSeries?.length ? previousSeries[0].data() : zeroSeries;
        const previousRef = previousSeries?.length ? previousSeries[0].ref : 'na';
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
                .add(merge(newSeries, { createdFromRef, nextRef: 'na', previousRef }))
            console.log('Created series', newSeriesRef.id)
            if (previousRef !== 'na') {
                await firestore().doc(previousRef.path).update({ nextRef: newSeriesRef });
            }
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
export const treatPortfolioCash = async (pfType: string, data: TransactionDataType | ValueDataType, userCurrency: string, createdFromRef: any, createdFrom: string) => {
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency]);
    const previousSeries = await findPreviousPortfolioSeries({
        date: data.after.date,
        userId: data.params.userId,
        pfId: data.params.portfolioId,
        dateEquality: '<=',
    });
    const previousRef = previousSeries?.length ? previousSeries[0].ref : 'na';
    if (pfType === 'nonperforming') {
        const aggregate = await createAccountsAggregation(data.params.userId, data.params.portfolioId, data.after.date, listOfCurrencies, pfType);
        try {
            const newSeriesRef = await firestore()
                .collection('users')
                .doc(data.params.userId)
                .collection('portfolios')
                .doc(data.params.portfolioId)
                .collection('series')
                .add(merge(aggregate, { createdFromRef, nextRef: 'na', previousRef, createdFrom }))
            console.log('Created portfolio cash series', newSeriesRef.id)
            if (previousRef !== 'na') {
                await firestore().doc(previousRef.path).update({ nextRef: newSeriesRef });
            }
        } catch (e) {
            console.log('Error saving portfolio cash series', e)
        }
    }
}
/*
performing
    impact the previous portfolio series
*/
export const treatPortfolioInvestment = async (pfType: string, data: TransactionDataType, userCurrency: string, createdFromRef: any) => {
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
        const previousRef = previousSeries?.length ? previousSeries[0].ref : 'na';
        const initial: boolean = previousSeries?.length ? false : true;
        const newSeries: InvestmentSeriesType = await impactInvestmentByTransaction(previous, data.after, listOfCurrencies, initial);
        try {
            const newSeriesRef = await firestore()
                .collection('users')
                .doc(data.params.userId)
                .collection('portfolios')
                .doc(data.params.portfolioId)
                .collection('series')
                .add(merge(newSeries, { createdFromRef, nextRef: 'na', previousRef }))
            console.log('Created portfolio investment series', newSeriesRef.id);
            if (previousRef !== 'na') {
                await firestore().doc(previousRef.path).update({ nextRef: newSeriesRef });
            }
        } catch (e) {
            console.log('Error saving portfolio investment series', e)
        }
    }
}