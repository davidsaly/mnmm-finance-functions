import * as functions from "firebase-functions";
import { firestore } from "firebase-admin";
import { convertIntoListOfCurrencies } from './utils/convert';
import { uniq } from 'lodash'
import { ValueDataType, CashSeriesType, InvestmentSeriesType } from './types';
import { impactCashByValue, impactInvestmentByValue, impactInvestmentByTransaction, createAccountsAggregation } from './utils/calculations';
import {
    findPreviousSeries, getUserCurrency,
    findPreviousSeriesByCreatedFrom, findSeriesBetweenDates,
    findPreviousPortfolioSeriesByCreatedFrom,
    findPreviousPortfolioSeries,
    findPortfolioSeriesBetweenDates,
} from "./utils/dataCalls";
import { treatPortfolioCash } from "./onTransactionUpdate";
import { initialCashSeries, initialInvestmentSeries } from "./utils/utils";
import { updateJob } from "./utils/utils";

export const onValueCreate = functions.firestore
    .document('users/{userId}/portfolios/{portfolioId}/accounts/{accountId}/values/{valueId}')
    .onCreate(async (snapshot, context) => {
        const after = snapshot.data();
        const data: ValueDataType = {
            after: {
                date: after?.date,
                amount: after?.amount,
                created: after?.created,
                currency: after?.currency,
                // createdFrom: after?.createdFrom,
            },
            params: {
                userId: context.params.userId,
                portfolioId: context.params.portfolioId,
                accountId: context.params.accountId,
                valueId: context.params.valueId,
            },
        }
        const userCurrency = await getUserCurrency(data.params.userId);
        await updateJob(data.params.userId, true);
        const { isInitialValuePerforming } = await treatAccount(data.params.portfolioId, data, userCurrency);
        await treatPortfolioCash(data.params.portfolioId, data, userCurrency);
        await treatPortfolioInvestment(data.params.portfolioId, data, userCurrency, isInitialValuePerforming);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await updateJob(data.params.userId, false);
        return 'done';
    });
/*{
    non-performing

    1. find previous series
    2. if does not exist - initialize with value and metrics 0
    3. if value != previous value -> increase Income or Increase spending by the difference
    4. Save series
    
    performing

    1. Load the Series on the day of previous Value
    2. If does not exist: initialize with value, metrics = 0, performance=100
    3. if exists: calculate metrics
    4. Save series

    conditional for both: if there are series after
    5. delete all the series after
    6. load values and transactions after and recalculate series
    7. save future series
}*/
const treatAccount = async (pfType: string, data: ValueDataType, userCurrency: string) => {
    console.log('Value updated: treating account');
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency, data.after.currency]);
    let isInitialValuePerforming = false;

    // nonperforming
    if (pfType === 'nonperforming') {
        const previousSeries = await findPreviousSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId,
            dateEquality: '<=',
        });
        let newSeries: CashSeriesType;
        if (previousSeries?.length) {
            newSeries = await impactCashByValue(previousSeries[0].data(), data.after, listOfCurrencies);
        } else {
            // initialize first series
            console.log('no previous series found, initializing...')
            const amount = await convertIntoListOfCurrencies(data.after.amount, data.after.currency, listOfCurrencies, data.after.date);
            newSeries = initialCashSeries(listOfCurrencies, data.after.date, data.after.created, 'value', amount);
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
            console.log('Created series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving series', e)
        }
        // performing
    } else if (pfType === 'performing') {
        // find previous series created from value or initial series created from transaction
        const previousSeries = await findPreviousSeriesByCreatedFrom({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId,
            createdFrom: ['initial', 'value'],
            dateEquality: '<=',
        });
        const previous = await findPreviousSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            accountId: data.params.accountId,
            dateEquality: '<='
        });
        let newSeries: InvestmentSeriesType;
        if (previousSeries?.length && previous?.length) {
            // this series is used to get the right date
            const previousForPerf = previousSeries[0].data();
            // this is the actual previous
            const previousActual = previous[0].data();
            // find all series created from transactions between the series date and new value date
            const params = {
                userId: data.params.userId,
                pfId: data.params.portfolioId,
                accountId: data.params.accountId,
                fromDate: previousForPerf.date,
                toDate: data.after.date,
                createdFrom: 'transaction',
                fromDateCreated: previousForPerf.created,
            };
            const transactionsBetween = await findSeriesBetweenDates(params);
            const amount = await convertIntoListOfCurrencies(data.after.amount, data.after.currency, listOfCurrencies, data.after.date);
            newSeries = await impactInvestmentByValue(previousForPerf, previousActual, transactionsBetween, data.after, listOfCurrencies, amount)
        } else {
            // initialize first series
            console.log('no previous series found, initializing...')
            const zeroSeries = initialInvestmentSeries(listOfCurrencies, data.after.date, data.after.created, 'initial');
            // initial value acts like transaction inflow impact
            newSeries = await impactInvestmentByTransaction(zeroSeries, data.after, listOfCurrencies, true);
            isInitialValuePerforming = true;
        }
        try {
            const newSeriesRef = await firestore().collection('users').doc(data.params.userId).collection('portfolios')
                .doc(data.params.portfolioId).collection('accounts').doc(data.params.accountId).collection('series')
                .add(newSeries)
            console.log('Created series', newSeriesRef.id)
        } catch (e) {
            console.log('Error saving series', e)
        }
    }
    return { isInitialValuePerforming };
}

/*
performing

*/
const treatPortfolioInvestment = async (pfType: string, data: ValueDataType, userCurrency: string, isInitialValuePerforming: boolean) => {
    const listOfCurrencies = uniq(['EUR', 'USD', userCurrency]);
    if (pfType === 'performing') {
        const previousSeriesInitial = await findPreviousPortfolioSeriesByCreatedFrom({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            createdFrom: ['initial'],
            dateEquality: '<=',
        });
        const previousSeriesValue = await findPreviousPortfolioSeriesByCreatedFrom({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            createdFrom: ['value'],
            dateEquality: '<',
        });
        const previous = await findPreviousPortfolioSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            dateEquality: '<='
        });
        const previousSeries = previousSeriesInitial?.length ? previousSeriesInitial : previousSeriesValue;
        let newSeries: InvestmentSeriesType;
        if (previousSeries?.length && previous?.length) {
            // this series is used to get the right date
            const previousForPerf = previousSeries[0].data();
            console.log('previousForPerf Portfolio', previousForPerf);
            // this is the actual previous
            const previousActual = previous[0].data();
            // find all series created from transactions between the series date and new value date
            const params = {
                userId: data.params.userId,
                pfId: data.params.portfolioId,
                accountId: data.params.accountId,
                fromDate: previousForPerf.date,
                toDate: data.after.date,
                createdFrom: 'transaction',
                fromDateCreated: previousForPerf.created,
            };
            console.log('params Portfolio', params);
            if (isInitialValuePerforming) {
                newSeries = await impactInvestmentByTransaction(previousActual, data.after, listOfCurrencies, false);
            } else {
                console.log('portfolio impact by value')
                const transactionsBetween = await findPortfolioSeriesBetweenDates(params);
                const aggregate = await createAccountsAggregation(data.params.userId, data.params.portfolioId, data.after.date, listOfCurrencies, pfType);
                newSeries = await impactInvestmentByValue(previousForPerf, previousActual, transactionsBetween, aggregate, listOfCurrencies, aggregate.amount)
            }
        } else {
            // initialize first series
            console.log('no previous series found, initializing...')
            const zeroSeries = initialInvestmentSeries(listOfCurrencies, data.after.date, data.after.created, 'initial');
            // initial value acts like transaction inflow impact
            newSeries = await impactInvestmentByTransaction(zeroSeries, data.after, listOfCurrencies, true);
        }
        try {
            const newSeriesRef = await firestore().collection('users').doc(data.params.userId).collection('portfolios')
                .doc(data.params.portfolioId).collection('series')
                .add(newSeries)
            console.log('Created Portfolio Investment Series', newSeriesRef.id)
            console.log('Portfolio Investment Series', newSeries);
        } catch (e) {
            console.log('Error saving series', e)
        }
    }
}