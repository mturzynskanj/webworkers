const { RBTree }                                   = require('bintrees');
const { filter, map, scan, publishBehavior }       = require('rxjs/operators');
const { merge }                                    = require('rxjs');

//------------------------------------------------------------------------------

const PRICE_SCALE = 10000000000;
const comparator = (a, b) => a.p - b.p;

//------------------------------------------------------------------------------

module.exports = (ws) => {

    const market_data_state$ = merge(
        ws.message$.pipe(
            filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA' && message.value.type == 'ORDERBOOK'),
            map(message => message.value)
        ),
        ws.status$.pipe(
            filter(status => status == 'CLOSED'),
            map(_ => 'SOCKET_CLOSED')
        )
    )
    .pipe(
        scan((market_data_state, message) => {
            if (message == 'SOCKET_CLOSED')
                return {}

            const { symbol, venue } = message;

            const ask_key = `${symbol}:${venue}:ASK`;
            const bid_key = `${symbol}:${venue}:BID`;

            let asks = market_data_state[ask_key];
            let bids = market_data_state[bid_key];

            if (asks === undefined)
            {
                asks = new RBTree(comparator)
                market_data_state[ask_key] = asks;
            }

            if (bids === undefined)
            {
                bids = new RBTree(comparator)
                market_data_state[bid_key] = bids;
            }

            if (message.snapshot)
            {
                asks.clear();
                bids.clear();
            }

            for (let ask of message.asks)
            {
                let price = Math.round(parseFloat(ask.p) * PRICE_SCALE);

                let quantity = parseFloat(ask.q);

                asks.remove({ p: price })
                // if (!BigNumber(ask.q).isEqualTo(0))
                if (Math.abs(parseFloat(ask.q)) > Number.EPSILON)
                    asks.insert({ p: price, q: quantity })
            }

            for (let bid of message.bids)
            {
                let price = Math.round(parseFloat(bid.p) * PRICE_SCALE);

                let quantity = parseFloat(bid.q);

                bids.remove({ p: price });
                // if (!BigNumber(bid.q).isEqualTo(0))
                if (Math.abs(parseFloat(bid.q)) > Number.EPSILON)
                    bids.insert({ p: price, q: quantity })
            }

            return market_data_state;
        }, {}),
        publishBehavior({})
    )

    // const market_data_state$ = ws.message$.pipe(
    //     filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA' && message.value.type == 'ORDERBOOK'),
    //     map(message => message.value),
    //     scan((market_data_state, message) => {

    //     }, {}),
    //     publishBehavior({})
    // )

    market_data_state$.connect();

    return market_data_state$;
}