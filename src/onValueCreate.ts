import * as functions from "firebase-functions";
import { ValueDataType } from './types';
import {
    getUserCurrency,
} from "./utils/dataCalls";
import { updateJob } from "./utils/utils";
import { treatPortfolioCash } from "./impactTransaction";
import { treatPortfolioInvestment, treatAccount } from "./impactValue";
import { run } from "./onTransactionCreate";

export const onValueCreate = functions.firestore
    .document('users/{userId}/portfolios/{portfolioId}/accounts/{accountId}/values/{valueId}')
    .onCreate(async (snapshot, context) => {
        const after = snapshot.data();
        const valueRef = snapshot.ref;
        const data: ValueDataType = {
            type: 'ValueDataType',
            after: {
                date: after?.date,
                amount: after?.amount,
                created: after?.created,
                currency: after?.currency,
                // createdFrom: after?.createdFrom,
                ordering: after?.ordering,
                orderingRef: after?.orderingRef,
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
        await run(data, userCurrency, valueRef);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await updateJob(data.params.userId, false);
        return 'done';
    });

export const impactByValue = async (portfolioId: string, data: ValueDataType, userCurrency: string, valueRef: any, account: string) => {
    let isInitialValuePerforming = false;
    if (data.params.accountId === account) {
        const treatment = await treatAccount(portfolioId, data, userCurrency, valueRef);
        isInitialValuePerforming = treatment.isInitialValuePerforming;
    }
    await treatPortfolioCash(portfolioId, data, userCurrency, valueRef, 'value');
    await treatPortfolioInvestment(portfolioId, data, userCurrency, isInitialValuePerforming, valueRef);
}