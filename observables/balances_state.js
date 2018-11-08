const { publishBehavior, filter, map, scan } = require('rxjs/operators');

module.exports = (ws) => {
    const balances_state$ = ws.message$.pipe(
        filter(message => message.type == 'DATA' && message.subscription.type == 'BALANCE'),
        map(message => message.value),
        scan((balances_state, balances) => {
            for (let balance of balances)
            {
                const { account, venue, asset } = balance;

                balances_state[`${account}:${venue}:${asset}`] = balance;
            }

            return balances_state;
        }, {}),
        publishBehavior({})
    )

    balances_state$.connect();

    return balances_state$;
}