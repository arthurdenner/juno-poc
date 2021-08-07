const axios = require('axios');
const chalk = require('chalk');
const express = require('express');
const faker = require('faker-br');

const JUNO_BASE_URL = 'https://sandbox.boletobancario.com';
const JUNO_PRIVATE_KEY =
  '1B2023512AE996041F15929BCB0E3DE1E9563105BA8B1F1511FF3A675032B48E';
// Cll0e074SanANu5L:[&fj}mz0R?c!tZ%Gw4_IEYG8lcS2>gwe in base64
const JUNO_CREDENTIALS =
  'Q2xsMGUwNzRTYW5BTnU1TDpbJmZqfW16MFI/YyF0WiVHdzRfSUVZRzhsY1MyPmd3ZQ==';

const app = express();
const client = axios.create({
  baseURL: JUNO_BASE_URL,
  headers: {
    'X-Api-Version': 2,
  },
});

client.interceptors.response.use(({ data }) => data);

const getBilling = () => {
  const firstName = faker.name.firstName();
  const lastName = faker.name.lastName();

  return {
    name: `${firstName} ${lastName}`,
    document: faker.br.cpf(),
    email: faker.internet
      .email(firstName.toLowerCase(), lastName.toLowerCase(), 'gmail.com')
      .replace(/[\d_]/g, ''),
    address: {
      street: faker.address.streetAddress(),
      number: faker.random.number(),
      city: 'Maceió',
      state: 'AL',
      postCode: '49052335',
    },
  };
};

const getCharge = () => ({
  amount: faker.finance.amount(),
  description: 'Pagamento único',
  paymentTypes: ['CREDIT_CARD'],
});

const getCredentials = async () =>
  client.post(
    '/authorization-server/oauth/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${JUNO_CREDENTIALS}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

const createCharge = ({ accessToken, billing, charge }) =>
  client.post(
    '/api-integration/charges',
    { billing, charge },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

app.post('/pay-once', async (req, res) => {
  try {
    const { confirmed, creditCardHash } = req.query;

    const billing = getBilling();
    const charge = getCharge();
    const credentials = await getCredentials();
    const { access_token: accessToken } = credentials;
    const newCharge = await createCharge({ accessToken, billing, charge });

    const { charges } = newCharge._embedded;
    const payments = await Promise.all(
      charges.map((charge) =>
        client.post(
          '/api-integration/payments',
          {
            chargeId: charge.id,
            billing: {
              address: billing.address,
              delayed: confirmed === 'false',
              email: billing.email,
            },
            creditCardDetails: {
              creditCardHash,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Resource-Token': JUNO_PRIVATE_KEY,
            },
          }
        )
      )
    );

    console.log(chalk.green('Single payment done'));
    res.status(200).send(payments);
  } catch (err) {
    console.error(chalk.red('Single payment error'));
    console.error(err);
    res.status(500).send(err);
  }
});

app.use('*', express.static('public'));

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
