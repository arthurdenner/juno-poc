# Juno POC

Testing the [Juno API 2.0](https://dev.juno.com.br/api/v2) to understand how single payments and recurrent payments work using their Sandbox environment.

## How to run it

- Copy the `.env.example` and rename it to `.env`
- Replace the environment variables with your credentials
  - Docs related to [JUNO_CREDENTIALS](https://dev.juno.com.br/api/v2#operation/getAccessToken)
  - Docs related to [JUNO_PRIVATE_KEY](https://dev.juno.com.br/api/v2#section/Servidor-de-Recursos)
- Install dependencies with `yarn`
- Run the project with `yarn start`
- Play around with the actions
- Verify the results on the [dashboard](https://sandbox.juno.com.br/#/chargeList)

## Features

- Perform a single payment
  - Returns billing, charge and payment information
- Trigger a recurrent payment
  - Returns billing and charge information
  - A payment will be performed each 5 seconds
  - dueDate incremented by 1 month each time
  - First payment automatic, others delayed
  - PS: Success or failure is only logged to console
- Cancel a recurrent payment
  - Only possible if a recurrent payment is on going
