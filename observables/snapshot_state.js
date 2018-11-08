const { Observable, merge } = require('rxjs');
const { filter, map, mapTo, publishBehavior, withLatestFrom, scan } = require('rxjs/operators');

module.exports = (ws) => {
    const snapshot_state$ = merge(
        ws.message$.pipe(
            filter(message => message.type == 'DATA' && message.subscription.type == 'MARKET_DATA' && message.value.type == 'ORDERBOOK'),
            map(message => message.value)
        ),
        ws.close$.pipe(
            mapTo('SOCKET_CLOSE')
        )
    ).pipe(
        scan((snapshot_state, value) => {
            if (value == 'SOCKET_CLOSE')
            {
                return {};
            }
            else
            {
                const { symbol, venue, snapshot } = value;

                const key = `${symbol}:${venue}`;

                if (snapshot)
                {
                    snapshot_state[key] = true;
                }

                return snapshot_state;
            }
        }, {}),
        publishBehavior({})
    )

    snapshot_state$.connect();

    return snapshot_state$
}