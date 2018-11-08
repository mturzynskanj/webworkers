const createBalancesStateObservable = require('./balances_state');
const createCumulativeTradeStateObservable = require('./cumulative_trade_state');
const createLadderInfoStateObservable = require('./ladder_info');
const createLastTradeStateObservable = require('./last_trade_state');
const createMainObservable = require('./main');
const createMarketDataStateObservable = require('./market_data_state');
const createOrderRejectObservable = require('./order_reject');
const createOrderStateObservable = require('./order_state');
const createSnapshotStateObservable = require('./snapshot_state');
const createSubscriptionStateObservable = require('./subscription_state');
const createUserTokenStateObservable = require('./user_token');

//------------------------------------------------------------------------------

module.exports = (ws) => {

    const main$ = createMainObservable();

    const balances_state$ = createBalancesStateObservable(ws);
    const cumulative_trade_state$ = createCumulativeTradeStateObservable(ws);
    const ladder_info$ = createLadderInfoStateObservable(main$)
    const last_trade_state$ = createLastTradeStateObservable(ws);
    const market_data_state$ = createMarketDataStateObservable(ws);
    const order_reject$ = createOrderRejectObservable(ws);
    const order_state$ = createOrderStateObservable(ws);
    const snapshot_state$ = createSnapshotStateObservable(ws);
    const subscription_state$ = createSubscriptionStateObservable(main$);
    const user_token_state$ = createUserTokenStateObservable(main$);

    return {
        main$,
        balances_state$,
        cumulative_trade_state$,
        ladder_info$,
        last_trade_state$,
        market_data_state$,
        order_reject$,
        order_state$,
        snapshot_state$,
        subscription_state$,
        user_token_state$
    }
}