import { firestore } from "firebase-admin";

export const findPreviousSeries = async ({ date, userId, pfId, accountId, dateEquality }:
    { date: string, userId: string, pfId: string, accountId: string, dateEquality: any }) => {
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
            .where('date', dateEquality, date)
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
            .limit(1)
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const findPreviousPortfolioSeries = async ({ date, userId, pfId, dateEquality }:
    { date: string, userId: string, pfId: string, dateEquality: any }) => {
    let res;
    try {
        const prevSeriesRef = firestore()
            .collection('users')
            .doc(userId)
            .collection('portfolios')
            .doc(pfId)
            .collection('series')
            .where('date', dateEquality, date)
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
            .limit(1)
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const findPreviousSeriesByCreatedFrom = async ({ date, userId, pfId, accountId, dateEquality, createdFrom }:
    { date: string, userId: string, pfId: string, accountId: string, dateEquality: any, createdFrom: string[] }) => {
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
            .where('createdFrom', 'in', createdFrom)
            .where('date', dateEquality, date)
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
            .limit(1)
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const findPreviousPortfolioSeriesByCreatedFrom = async ({ date, userId, pfId, dateEquality, createdFrom }:
    { date: string, userId: string, pfId: string, dateEquality: any, createdFrom: string[] }) => {
    let res;
    try {
        const prevSeriesRef = firestore()
            .collection('users')
            .doc(userId)
            .collection('portfolios')
            .doc(pfId)
            .collection('series')
            .where('createdFrom', 'in', createdFrom)
            .where('date', dateEquality, date)
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
            .limit(1)
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const findSeriesBetweenDates = async ({ userId, pfId, accountId, createdFrom, fromDate, toDate, fromDateCreated }:
    {
        userId: string, pfId: string, accountId: string,
        createdFrom: string, fromDate: string, toDate: string, fromDateCreated: string
    }) => {
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
            .where('createdFrom', '==', createdFrom)
            .where('date', '>=', fromDate)
            .where('date', '<=', toDate)
            // .where('created', '>=', fromDateCreated) // TODO
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
        const series = await prevSeriesRef.get()
        res = series.docs;
        console.log('transaction series between', res);
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const findPortfolioSeriesBetweenDates = async ({ userId, pfId, createdFrom, fromDate, toDate, fromDateCreated }:
    {
        userId: string, pfId: string,
        createdFrom: string, fromDate: string, toDate: string, fromDateCreated: string
    }) => {
    let res;
    try {
        const prevSeriesRef = firestore()
            .collection('users')
            .doc(userId)
            .collection('portfolios')
            .doc(pfId)
            .collection('series')
            .where('createdFrom', '==', createdFrom)
            .where('date', '>=', fromDate)
            .where('date', '<=', toDate)
            // .where('created', '>=', fromDateCreated) // TODO
            .orderBy('date', 'desc')
            .orderBy('created', 'desc')
        const series = await prevSeriesRef.get()
        res = series.docs;
    } catch (e) {
        console.log('error loading previous series', e);
    }
    return res;
}

export const getUserCurrency = async (userId: string) => {
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

export const getAccountsForPortfolio = async (userId: string, pfId: string) => {
    const accountsRef = firestore()
        .collection('users')
        .doc(userId)
        .collection('portfolios')
        .doc(pfId)
        .collection('accounts')
    let docs: any[] = [];
    try {
        const accounts = await accountsRef.get();
        accounts.forEach(doc => {
            docs = [...docs, { ...doc.data(), ...{ id: doc.id } }];
        });
    } catch (e) {
        console.error('Error fetching accounts for portfolio', e);
    }
    return docs;
}