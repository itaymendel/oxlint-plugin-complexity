// @complexity processData:cyclomatic=8,cognitive=16 validateInput:cyclomatic=4,cognitive=3 transform:cyclomatic=2,cognitive=1

function processData(data) {
  if (data === null) {
    return null;
  }

  if (data.type === 'array') {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].active) {
        if (data.items[i].value > 0) {
          switch (data.items[i].priority) {
            case 'high':
              return data.items[i].value * 2;
            case 'low':
              return data.items[i].value;
          }
        }
      }
    }
  }

  return 0;
}

function validateInput(input) {
  if (!input || typeof input !== 'object') {
    return false;
  }
  if (!input.type) {
    return false;
  }
  return true;
}

function transform(value) {
  return value > 0 ? value * 2 : value;
}
