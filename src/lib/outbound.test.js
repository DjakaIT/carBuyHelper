import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoscout24Url, njuskaloScope, njuskaloUrl } from './outbound.js'

const criteria = {
  fuelAllow: ['benzin'],
  countries: ['HR'],
  yearMin: 2020,
  priceMax: 23000,
  mileageMax: 95000,
  bodyTypes: ['limuzina', 'suv'],
}

const models = [
  { make: 'Audi', model: 'A5', njuskaloIds: [15994, 12400] },
  { make: 'Audi', model: 'A6', njuskaloIds: [10975] },
  { make: 'Škoda', model: 'Octavia' },
]

const withIds = models.filter((model) => model.njuskaloIds)

test('njuskalo link nosi sve poznate ID-jeve i granice iz kriterija', () => {
  const url = new URL(njuskaloUrl(criteria, withIds))

  assert.equal(url.host, 'www.njuskalo.hr')
  assert.equal(url.searchParams.get('vehicleIds'), '15994,12400,10975')
  assert.equal(url.searchParams.get('price[max]'), '23000')
  assert.equal(url.searchParams.get('yearManufactured[min]'), '2020')
  assert.equal(url.searchParams.get('mileage[max]'), '95000')
  assert.equal(url.searchParams.get('onlyFullPrice'), '1')
  assert.equal(url.searchParams.get('fuelTypeId'), '600')
  assert.deepEqual(url.searchParams.getAll('bodyTypeId'), ['21', '380'])
})

test('ako ijednom modelu fali ID, ID-jevi se ne šalju uopće', () => {
  // inače bi se pretraga tiho svela na modele koje poznajemo i izgledala kao da ostalih nema
  const url = new URL(njuskaloUrl(criteria, models))

  assert.equal(url.searchParams.get('vehicleIds'), null)
  assert.equal(njuskaloScope(models), 'all')
  assert.equal(njuskaloScope(withIds), 'models')
})

test('model bez ID-a pada na pretragu po marki', () => {
  const url = new URL(njuskaloUrl(criteria, [{ make: 'Škoda', model: 'Octavia' }]))

  assert.equal(url.pathname, '/auti/skoda')
  assert.equal(url.searchParams.get('vehicleIds'), null)
  assert.equal(url.searchParams.get('price[max]'), '23000')
})

test('više marki bez ID-a otvara pretragu po svim markama', () => {
  const url = new URL(
    njuskaloUrl(criteria, [
      { make: 'Škoda', model: 'Octavia' },
      { make: 'Volvo', model: 'S60' },
    ]),
  )

  assert.equal(url.pathname, '/auti')
  assert.equal(url.searchParams.get('mileage[max]'), '95000')
})

test('autoscout24 link za odabrani model vodi na taj model', () => {
  const url = new URL(autoscout24Url(criteria, { make: 'Škoda', model: 'Octavia' }))

  assert.equal(url.pathname, '/lst/skoda/octavia')
  assert.equal(url.searchParams.get('priceto'), '23000')
  assert.equal(url.searchParams.get('kmto'), '95000')
  assert.equal(url.searchParams.get('fregfrom'), '2020')
  assert.equal(url.searchParams.get('fuel'), 'B')
  assert.deepEqual(url.searchParams.getAll('body'), ['6', '4'])
  assert.equal(url.searchParams.get('cy'), 'D,A')
})

test('bez modela autoscout24 otvara pretragu po svim markama', () => {
  assert.equal(new URL(autoscout24Url(criteria, null)).pathname, '/lst')
})

test('odabir država mijenja tržišta u linku', () => {
  const url = new URL(autoscout24Url(criteria, null, ['DE', 'IT']))
  assert.equal(url.searchParams.get('cy'), 'D,I')
})

test('pooštrenje iz configa nadjačava kriterije samo u linkovima', () => {
  const nj = new URL(njuskaloUrl(criteria, withIds, { yearMin: 2021 }))
  const as = new URL(autoscout24Url(criteria, null, ['DE', 'AT'], { yearMin: 2021 }))

  assert.equal(nj.searchParams.get('yearManufactured[min]'), '2021')
  assert.equal(as.searchParams.get('fregfrom'), '2021')
  // ostalo ostaje kako je zadano
  assert.equal(nj.searchParams.get('price[max]'), '23000')
  assert.equal(as.searchParams.get('kmto'), '95000')
})

test('bez pooštrenja vrijedi godište iz kriterija', () => {
  assert.equal(new URL(njuskaloUrl(criteria, withIds)).searchParams.get('yearManufactured[min]'), '2020')
})
