const { filter, map, scan, publishBehavior }  = require('rxjs/operators');
const { RBTree }                              = require('bintrees');
const { PRICE_SCALE }                         = require('../constants');

//------------------------------------------------------------------------------

const comparator = (a, b) => a.p - b.p;

module.exports = (ws) => {
    const cumulative_trade_state$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA' && message.value.type == 'TRADE'),
        map(message => message.value),
        scan((trades_state, value) => {
            let { symbol, venue, qty, price } = value;

            const key = `${symbol}:${venue}`;

            qty = parseFloat(qty);
            price = Math.round(parseFloat(price) * PRICE_SCALE);

            let trades = trades_state[key];

            if (trades === undefined)
            {
                trades = new RBTree(comparator);
                trades_state[key] = trades;
            }

            let cur = trades.find({ p: price });

            if (cur === null)
            {
                trades.insert({ p: price, q: qty })
            }
            else
            {
                trades.remove({ p: price });
                trades.insert({ p: price, q: cur.q + qty });
            }

            return trades_state;
        }, {}),
        publishBehavior({})
    )

    cumulative_trade_state$.connect();

    return cumulative_trade_state$;
}