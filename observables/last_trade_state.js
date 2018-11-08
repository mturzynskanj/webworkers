const { empty, of }                                     = require('rxjs');
const { filter, map, mergeScan, publishBehavior }       = require('rxjs/operators');

//------------------------------------------------------------------------------

const PRICE_SCALE = 10000000000;

//------------------------------------------------------------------------------

module.exports = (ws) => {
    const last_trade$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA' && message.value.type == 'TRADE'),
        mergeScan((cur_last_trade, message) => {
            let { symbol, venue, price, qty, side } = message.value;

            if (side === null) return empty();

            price = Math.round(parseFloat(price) * PRICE_SCALE);

            let direction;
            if (cur_last_trade === null)
            {
                direction = 0;
            }
            else
            {
                if (price > cur_last_trade.price) direction = 1
                else if (price < cur_last_trade.price) direction = -1
                else direction = 0
            }

            return of({
                symbol,
                venue,
                price,
                qty,
                side,
                direction
            })
        }, null),
        publishBehavior(null)
    )

    last_trade$.connect();

    return last_trade$;
}