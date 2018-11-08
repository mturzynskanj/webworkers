const ws                          = require('web_socket');
const { WEB_SOCKET_URL }          = require('config');
const { isImmutable,
        fromJS,
        Set,
        List,
        Map,
        Seq}                      = require('immutable');
const $$observable                = require('symbol-observable').default;
const _                           = require('lodash');
const BigNumber                   = require('bignumber.js');
const jwtDecode                   = require('jwt-decode');
const transit                     = require('transit-immutable-js');
const createTree                  = require("functional-red-black-tree")
const { RBTree }                  = require('bintrees');
const { sizeSubscriptionToValue,
        midSubscriptionToValue,
        pctUpDownSubscriptionToValue,
        orderSubscriptionToValue,
        totalWorkingSubscriptionToValue,
        qtyTradeSubscriptionToValue,
        lastTradeSubscriptionToValue,
        selectSocketSubscriptions,
        subscriptionToValue }     = require('./helpers')
const { Subject, combineLatest }  = require('rxjs');
const { filter,
        map,
        withLatestFrom,
        pairwise,
        sampleTime,
        tap
    } = require('rxjs/operators');
const createObservables           = require('./observables');
const { PRICE_SCALE }             = require('./constants');

//------------------------------------------------------------------------------

const web_socket = ws(WEB_SOCKET_URL);

//------------------------------------------------------------------------------

const observables = createObservables(web_socket);

//------------------------------------------------------------------------------

combineLatest(web_socket.status$, observables.user_token_state$)
    .pipe(
        filter(([status, user_token_state]) => status == 'OPEN_UNAUTHENTICATED' && user_token_state !== null)
    )
    .subscribe(([status, user_token]) => {
        web_socket.send(JSON.stringify({
            type: 'AUTH',
            token: user_token
        }))
    })

web_socket.status$.pipe(
    filter(status => status == 'OPEN_UNAUTHENTICATED')
)
.subscribe(_ => {
    postMessage({ type: 'SOCKET_OPENED' })
})

web_socket.status$.pipe(
    filter(status => status == 'CLOSED')
)
.subscribe(_ => {
    postMessage({ type: 'SOCKET_CLOSED' })
})

web_socket.status$.pipe(
    filter(status => status == 'OPEN_AUTHENTICATED')
)
.subscribe(_ => {
    postMessage({ type: 'SOCKET_AUTH' })
})

observables.order_reject$.subscribe(order_reject => postMessage({ type: 'ORDER_REJECT', order_reject }))

observables.balances_state$.subscribe(balances_state => postMessage({ type: 'BALANCES', balances: _.values(balances_state) }))

//------------------------------------------------------------------------------

observables.main$.pipe(
        filter(message => message.type == 'SUB'),
        withLatestFrom(observables.market_data_state$, observables.order_state$, observables.cumulative_trade_state$, observables.last_trade_state$),
        map(([message, market_data_state, order_state, cumulative_trade_state, last_trade_state]) => ({
            message,
            value: subscriptionToValue(message.subscription, market_data_state, order_state, cumulative_trade_state, last_trade_state)
        }))
    )
    .subscribe(({ message, value }) => {
        postMessage({
            type: 'DATA',
            value_by_id: {
                [message.id]: value
            }
        })
    })

//------------------------------------------------------------------------------

const market_data_update_subscription_triggers = {
    SIZE:        'SIZE',
    CUM_SIZE:    'CUM_SIZE',
    MID:         'MID',
    PCT_UP_DOWN: 'PCT_UP_DOWN',
    ORDER:       'ORDER',
    QTY_TRADED:  'QTY_TRADED',
    LAST_TRADE:  'LAST_TRADE'
}

observables.market_data_state$.pipe(
    sampleTime(125),
    withLatestFrom(observables.order_state$, observables.cumulative_trade_state$, observables.last_trade_state$, observables.subscription_state$),
    map(([market_data_state, order_state, cumulative_trade_state, last_trade_state, subscription_state]) => {
        const values_by_subscription_id = {};

        _.forEach(subscription_state, (subscription, id) => {
            if (subscription.type in market_data_update_subscription_triggers)
                values_by_subscription_id[id] = subscriptionToValue(subscription, market_data_state, order_state, cumulative_trade_state, last_trade_state);
        })

        return values_by_subscription_id;
    })
).subscribe(values_by_subscription_id => {
    postMessage({
        type: 'DATA',
        value_by_id: values_by_subscription_id
    })
})


//send updated subscription values when order state updates
//------------------------------------------------------------------------------

const order_update_subscription_triggers = {
    ORDER: 'ORDER',
    TOTAL_WORKING: 'TOTAL_WORKING'
}

observables.order_state$.pipe(
    tap(order_state => console.log(order_state)),
    withLatestFrom(observables.market_data_state$, observables.cumulative_trade_state$, observables.last_trade_state$, observables.subscription_state$),
    map(([order_state, market_data_state, cumulative_trade_state, last_trade_state, subscription_state]) => {
        const values_by_subscription_id = {};

        _.forEach(subscription_state, (subscription, id) => {
            if (subscription.type in order_update_subscription_triggers)
                values_by_subscription_id[id] = subscriptionToValue(subscription, market_data_state, order_state, cumulative_trade_state, last_trade_state)
        })

        return values_by_subscription_id;
    })
).subscribe(values_by_subscription_id => {
    console.log(values_by_subscription_id)

    postMessage({
        type: 'DATA',
        value_by_id: values_by_subscription_id
    })
})


//sync socket subscriptions
//------------------------------------------------------------------------------


const socket_subscriptions$ = combineLatest(observables.ladder_info$, observables.user_token_state$).pipe(
    map(([ladder_info, user_token_state]) => selectSocketSubscriptions(ladder_info, user_token_state))
);

web_socket.status$
    .pipe(
        filter(status => status == 'OPEN_AUTHENTICATED'),
        withLatestFrom(socket_subscriptions$),
        map(([_, socket_subscriptions]) => socket_subscriptions)
    )
    .subscribe(subscriptions => {
        subscriptions.forEach(subscription => {
            web_socket.send(JSON.stringify({
                type: 'SUBSCRIBE',
                subscription
            }))
        })
    })

socket_subscriptions$
    .pipe(
        pairwise(),
        withLatestFrom(web_socket.status$),
        filter(([prev_cur_subscriptions, status]) => status == 'OPEN_AUTHENTICATED'),
        map((prev_cur_subscriptions, _) => prev_cur_subscriptions)
    )
    .subscribe(([prev, cur]) => {
        const new_subs = _.differenceWith(cur, prev, _.isEqual);

        new_subs.forEach(subscription => {
            web_socket.send(JSON.stringify({
                type: 'SUBSCRIBE',
                subscription
            }))
        })

        const old_subs = _.differenceWith(prev, cur, _.isEqual);

        old_subs.forEach(subscription => {
            web_socket.send(JSON.stringify({
                type: 'UNSUBSCRIBE',
                subscription
            }))
        })

    })

//------------------------------------------------------------------------------

combineLatest(observables.snapshot_state$, observables.ladder_info$)
    .pipe(
        filter(([_, ladder_info]) => ladder_info !== null),
        map(([snapshot_state, ladder_info]) => {
            const { symbol, venue } = ladder_info;

            if (Array.isArray(venue))
            {
                return venue.reduce((acc, v) => acc && (snapshot_state[`${symbol}:${v}`] || false), true);
            }
            else
            {
                const snapshot = snapshot_state[`${symbol}:${venue}`];

                if (snapshot === undefined) return false;

                return snapshot;
            }
        })
    )
    .subscribe(snapshot => {
        postMessage({
            type: 'SNAPSHOT',
            snapshot
        })
    })

//------------------------------------------------------------------------------
//----------------------------------WEB SOCKET----------------------------------


// web_socket.close$.subscribe(() => {
//     state.socket_opened = false;
//     state.socket_authenticated = false;

//     state.sizes_by_price = Map();
//     state.snapshots = Map();
// })



// web_socket.trade$.subscribe(trade => {
//     postMessage({
//         type: 'TRADE',
//         trade
//     })
// })

//------------------------------------------------------------------------------


