# Juno POC

Testing the Juno API 2.0 to understand how single payments and recurrent payments work using their Sandbox environment.

## How to run it

- Copy the `.env.example` and rename it to `.env`
- Replace the environment variables with your credentials
  - Docs related to [JUNO_CREDENTIALS](https://dev.juno.com.br/api/v2#operation/getAccessToken)
  - Docs related to [JUNO_PRIVATE_KEY](https://dev.juno.com.br/api/v2#section/Servidor-de-Recursos)
- Install dependencies with `yarn`
- Run the project with `yarn start`
- Play around with the actions
- Verify the results on the [dashboard](https://sandbox.juno.com.br/#/chargeList)
