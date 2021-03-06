/**
 * Perform any post processing on the TmpRecordDatabase if necessary
 * Autocorrect the records if any errors are found
 * @flow
 */
import { join } from 'path';
import { writeFileSync } from 'fs';
import TmpRecordDatabase from '../src/database/TmpRecordDatabase';
import RecordMetadataDatabase from '../src/database/RecordMetadataDatabase';
import type { DatabaseRecordType } from '../src/database/DatabaseRecordType';
import { caniuseBrowsers } from '../src/helpers/Constants';


type targetsType = {
  targets: {
    [name: string]: {
      [version: string]: 'y' | 'n' | 'prefixed'
    }
  }
};

export default async function PostChecks(rMTableName?: string): Promise<DatabaseRecordType> {
  const recordMetadataDatabase = new RecordMetadataDatabase(rMTableName);
  const tmpRecordDatabase = new TmpRecordDatabase(process.env.TMP_RECORD_DB_NAME);

  const tmpRecords = await tmpRecordDatabase.getAll();
  const recordMetadata = await recordMetadataDatabase.getAll();
  const dedupedRecordsMap: Map<string, targetsType> = new Map();

  console.log(
    `${recordMetadata.length} Metadata Records`,
    `${tmpRecords.length} Tmp Records`
  );

  // Merge all the duplicated records
  // For every record in RecordMetadata and for each caniuse database
  // in TmpRecordDatabase and compile them into a single record
  recordMetadata.forEach((record) => {
    caniuseBrowsers.forEach((caniuseBrowser) => {
      const compiledVersions: {[version: string]: string} = tmpRecords
        .filter(tmpRecord =>
          tmpRecord.protoChainId === record.protoChainId &&
          tmpRecord.caniuseId === caniuseBrowser
        )
        .map(tmpRecord => JSON.parse(tmpRecord.versions))
        .reduce((p, c) => ({ ...p, ...c }), {});

      if (dedupedRecordsMap.has(record.protoChainId)) {
        const item = dedupedRecordsMap.get(record.protoChainId);

        if (!item) {
          throw new Error('Targets do not exist');
        }

        dedupedRecordsMap.set(record.protoChainId, {
          ...item,
          targets: {
            [caniuseBrowser]: compiledVersions,
            ...item.targets
          }
        });
      } else {
        dedupedRecordsMap.set(record.protoChainId, {
          targets: {
            [caniuseBrowser]: compiledVersions
          },
          ...record
        });
      }
    });
  });

  const finalRecords: DatabaseRecordType = {
    records: Array.from(dedupedRecordsMap.values())
  };

  writeFileSync(
    join(__dirname, '..', 'lib', 'all.json'),
    JSON.stringify(finalRecords)
  );

  return finalRecords;
}
