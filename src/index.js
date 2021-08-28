require('dotenv-safe').config({
  allowEmptyValues: true,
});

const axios = require('axios');
const chalk = require('chalk');
const addMonths = require('date-fns/addMonths');
const format = require('date-fns/format');
const express = require('express');
const faker = require('faker-br');

// Credit card for recurrent payments
let creditCardId = null;
// setInterval number
let intervalId = null;
// Keep track of dueDate for recurrent payments
let lastDueDate = null;

const JUNO_BASE_URL = 'https://sandbox.boletobancario.com';
const {
  JUNO_CREDENTIALS,
  JUNO_PRIVATE_KEY,
  JUNO_SPLIT_TOKEN,
  PORT = 3000,
} = process.env;

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

const getCharge = (recurrent) => ({
  amount: faker.finance.amount(),
  description: `Pagamento ${recurrent ? 'recorrente' : 'único'}`,
  paymentTypes: ['CREDIT_CARD'],
  split: JUNO_SPLIT_TOKEN
    ? [
        {
          recipientToken: JUNO_PRIVATE_KEY,
          percentage: 50,
        },
        {
          recipientToken: JUNO_SPLIT_TOKEN,
          percentage: 50,
          amountRemainder: true,
          chargeFee: true,
        },
      ]
    : undefined,
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

const performPayment = ({
  accessToken,
  billing,
  chargeId,
  creditCardDetails,
  delayed,
}) =>
  client.post(
    '/api-integration/payments',
    {
      chargeId,
      billing: {
        delayed,
        address: billing.address,
        email: billing.email,
      },
      creditCardDetails,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

const performRecurrentPayment = async ({ billing, charge }) => {
  // Get credentials for request
  const credentials = await getCredentials();
  const { access_token: accessToken } = credentials;
  // Only delay payments if not the first
  const delayed = Boolean(lastDueDate);
  // Update dueDate
  lastDueDate = lastDueDate ? addMonths(lastDueDate, 1) : new Date();
  // Create new charge
  const newCharge = await createCharge({
    accessToken,
    billing,
    charge: {
      ...charge,
      dueDate: format(lastDueDate, 'yyyy-MM-dd'),
    },
  });
  const { charges } = newCharge._embedded;

  // Perform payment for each charge (only one in this case)
  const payments = await Promise.all(
    charges.map(({ id }) =>
      performPayment({
        accessToken,
        billing,
        chargeId: id,
        delayed,
        creditCardDetails: {
          // !Use tokenized id instead of hash
          creditCardId,
        },
      })
    )
  );

  console.log(chalk.green('Recurrent payment done'));
};

const tokenizeCard = ({ accessToken, creditCardHash }) =>
  client.post(
    '/api-integration/credit-cards/tokenization',
    { creditCardHash },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Resource-Token': JUNO_PRIVATE_KEY,
      },
    }
  );

app.post('/pay-once', async (req, res) => {
  try {
    // Extract URL params
    const { confirmed, creditCardHash } = req.query;
    // Get credentials for request
    const credentials = await getCredentials();
    const { access_token: accessToken } = credentials;
    // Generate data
    const billing = getBilling();
    const charge = getCharge();
    // Create new charge
    const newCharge = await createCharge({ accessToken, billing, charge });
    const { charges } = newCharge._embedded;
    // Perform payment for each charge (only one in this case)
    const payments = await Promise.all(
      charges.map(({ id }) =>
        performPayment({
          accessToken,
          billing,
          chargeId: id,
          delayed: confirmed === 'false',
          creditCardDetails: {
            // !Use hash generate in the front
            creditCardHash,
          },
        })
      )
    );

    console.log(chalk.green('Single payment done'));
    res.status(200).send({ billing, charge, payments });
  } catch (err) {
    console.error(chalk.red('Single payment error'));
    console.error(err);
    res.status(500).send(err);
  }
});

app.post('/pay-recurrent', async (req, res) => {
  try {
    if (intervalId) {
      console.log('Cancelling recurrent payment');
      clearInterval(intervalId);
      // Reset global variables
      creditCardId = null;
      intervalId = null;
      lastDueDate = null;
    }

    // Extract URL params
    const { confirmed, creditCardHash } = req.query;
    // Get credentials for request
    const credentials = await getCredentials();
    const { access_token: accessToken } = credentials;

    // Tokenized if no card is stored
    if (!creditCardId) {
      const tokenizedCard = await tokenizeCard({ accessToken, creditCardHash });
      creditCardId = tokenizedCard.creditCardId;
    }

    // Generate data
    const billing = getBilling();
    const charge = getCharge(true);

    // Trigger recurrent payment each 5 seconds
    intervalId = setInterval(() => {
      performRecurrentPayment({ billing, charge });
    }, 5000);

    console.log(chalk.green('Recurrent payment triggered'));
    res.status(200).json({ billing, charge });
  } catch (err) {
    console.error(chalk.red('Recurrent payment error'));
    res.status(500).send(err);
  }
});

app.post('/stop-recurrence', (_, res) => {
  if (!intervalId) {
    console.log('No recurrent payment on going');
    res.status(404).end();
    return;
  }

  console.log('Cancelling recurrent payment');
  clearInterval(intervalId);
  // Reset global variables
  creditCardId = null;
  intervalId = null;
  lastDueDate = null;

  res.status(200).end();
});

app.use('*', express.static('public'));

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
