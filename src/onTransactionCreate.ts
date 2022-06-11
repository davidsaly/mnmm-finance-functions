import * as functions from "firebase-functions";
import { firestore } from "firebase-admin";
import { get, merge } from 'lodash'
import { TransactionDataType, ValueDataType } from './types';
import {
    getUserCurrency, findPreviousPortfolioSeries,
    findPortfolioSeriesAfterSeries, findRecordsLinkedToSeries,
    findPortfolioSeriesByCreatedFrom, findAccountSeriesByCreatedFrom
} from "./utils/dataCalls";
import { updateJob } from "./utils/utils";
import { treatAccount, treatPortfolioCash, treatPortfolioInvestment } from "./impactTransaction";
import { impactByValue } from "./onValueCreate";

/*
* check if there are any series with date >= transaction/value date
* if yes, delete all the ones in future
* collect transactions and values with dates >= transaction / value date
* order them primarily by date and secondarily by created date
* process them one by one as if they were added
*/

export const onTransactionCreate = functions.firestore
    .document('users/{userId}/portfolios/{portfolioId}/accounts/{accountId}/transactions/{transactionId}')
    .onCreate(async (snapshot, context) => {
        const after = snapshot.data();
        const txRef = snapshot.ref;
        const data: TransactionDataType = {
            type: 'TransactionDataType',
            after: {
                date: after?.date,
                amount: after?.amount,
                created: after?.created,
                currency: after?.currency,
                flow: after?.flow,
                type: after?.type,
                ordering: after?.ordering,
                orderingRef: after?.orderingRef,
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
        await run(data, userCurrency, txRef);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await updateJob(data.params.userId, false);
        return 'done';
    });

export const impactByTransaction = async (portfolioId: string, data: TransactionDataType, userCurrency: string, txRef: any, account: string, previousAccountSeries: any) => {
    console.log('impacting');
    if (data.params.accountId === account) {
        await treatAccount(portfolioId, data, userCurrency, txRef, previousAccountSeries);
    }
    await treatPortfolioCash(portfolioId, data, userCurrency, txRef, 'transaction');
    await treatPortfolioInvestment(portfolioId, data, userCurrency, txRef);
}

export const run = async (data: TransactionDataType | ValueDataType, userCurrency: string, createdFromRef: any) => {
    // if there is before/after
    const affectedAccount = data.params.accountId;
    console.log('data.after', data.after);
    if (data.after.ordering === 'After' || data.after.ordering === 'Before') {
        console.log('there is before/after', data.after.ordering);
        //      find previous portfolio series
        let previousRef;
        if (data.after.ordering === 'After') {
            previousRef = data.after.orderingRef
        } else if (data.after.ordering === 'Before') {
            const afterRef: any = data.after.orderingRef;
            const after = await firestore().doc(afterRef.path).get()
            previousRef = get(after.data(), 'previousRef');
        }
        if (previousRef) {
            const previous: any = await firestore().doc(previousRef.path).get();
            // previous is Account Series
            const previousData = previous.data();
            const previousPf = await findPortfolioSeriesByCreatedFrom(previousData.createdFromRef, data.params.userId, data.params.portfolioId)
            if (previousData.nextRef === 'na') {
                //          portfolio series has no nextRef -> impact with the transaction record
                if (data.type === 'TransactionDataType') {
                    await impactByTransaction(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount, previous);
                }
                if (data.type === 'ValueDataType') {
                    await impactByValue(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount);
                }
            } else {
                //          portfolio has nextRef
                await treatWhenSeriesHasNext(previousPf, [previous], data, userCurrency, createdFromRef)
            }
        } else {
            if (data.type === 'TransactionDataType') {
                await impactByTransaction(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount, undefined);
            }
            if (data.type === 'ValueDataType') {
                await impactByValue(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount);
            }
        }
    } else {
        // there is no before/after
        console.log('there is no before/after');
        const previous = await findPreviousPortfolioSeries({
            date: data.after.date,
            userId: data.params.userId,
            pfId: data.params.portfolioId,
            dateEquality: '<='
        });
        // previous is Portfolio Series
        const previousData = previous?.length ? previous[0].data() : undefined;
        if (previousData && previousData.nextRef !== 'na') {
            //      the previous has a nextRef -> continue as "portfolio has nextRef"
            const previousAccount = await findAccountSeriesByCreatedFrom(previousData.createdFromRef, data.params.userId, data.params.portfolioId, data.params.accountId);
            await treatWhenSeriesHasNext(previous, previousAccount, data, userCurrency, createdFromRef);
        } else {
            //      the previous has no nextRef -> impact
            if (data.type === 'TransactionDataType') {
                await impactByTransaction(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount, undefined)
            }
            if (data.type === 'ValueDataType') {
                await impactByValue(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount)
            }
        }
    }
}

const treatWhenSeriesHasNext = async (previousPortfolio: any, previousAccount: any, data: any, userCurrency: string, createdFromRef: any) => {
    console.log('treating when there is a next');
    console.log('previousPortfolio', previousPortfolio);
    console.log('previousAccount', previousAccount)
    //              find all the series after (for both portfolio and impacted account)
    //                  account
    const accountSeriesAfter = await findPortfolioSeriesAfterSeries({ series: previousAccount[0].data() });
    //                  portfolio
    // const previousPortfolio = await findPortfolioSeriesByCreatedFrom(previousData.createdFromRef, data.params.userId, data.params.portfolioId);
    const portfolioSeriesAfter = await findPortfolioSeriesAfterSeries({ series: previousPortfolio[0].data() });
    //              find al the linked transactions/values (based of portfolio series)
    const records = await findRecordsLinkedToSeries(portfolioSeriesAfter);
    console.log('records', records);
    //              delete all the series after (both portfolio and impacted account)
    for (let index = 0; index < accountSeriesAfter.length; index++) {
        const deleteRef = firestore().doc(accountSeriesAfter[index].ref.path)
        await deleteRef.delete()
        console.log('deleted account series', deleteRef.id)
    }
    for (let index = 0; index < portfolioSeriesAfter.length; index++) {
        const deleteRef = firestore().doc(portfolioSeriesAfter[index].ref.path)
        await deleteRef.delete()
        console.log('deleted portfolio series', deleteRef.id)
    }
    const affectedAccount = data.params.accountId;
    //              impact portfolio and account by the newly created transaction
    if (data.type === 'TransactionDataType') {
        await impactByTransaction(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount, previousAccount[0])
    }
    if (data.type === 'ValueDataType') {
        await impactByValue(data.params.portfolioId, data, userCurrency, createdFromRef, affectedAccount)
    }
    //              impact portfolio and affected account with an array of records coming after
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const d = merge(data, { after: record.data, params: { accountId: record.account } });
        console.log('d', d);
        if (record.type === 'transaction' || record.type === 'initial') {
            // only affected accounts
            await impactByTransaction(data.params.portfolioId, d, userCurrency, record.ref, affectedAccount, undefined)
        }
        if (record.type === 'value') {
            await impactByValue(data.params.portfolioId, d, userCurrency, record.ref, affectedAccount)
        }

    }
}