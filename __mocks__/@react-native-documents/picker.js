const errorCodes = {
  OPERATION_CANCELED: 'OPERATION_CANCELED',
  IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
  UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
  NULL_PRESENTER: 'NULL_PRESENTER',
};

module.exports = {
  pick: jest.fn(async () => [{ uri: 'file:///tmp/doc.pdf', name: 'doc.pdf', size: 1024, type: 'application/pdf' }]),
  types: { pdf: 'application/pdf', images: 'image/*', allFiles: '*/*' },
  errorCodes,
  isErrorWithCode: (error) => Boolean(error && typeof error.code === 'string'),
};
