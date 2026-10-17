"""Freeze the remaining legacy match contract in an isolated read rehearsal."""
import argparse
from connection import connect, isolated_schema


def prepare(connection, name):
    schema=isolated_schema(name)
    # Current deployed scout endpoints still read the compatibility match shape.
    # No OR REPLACE: refuse to overwrite an existing rehearsal snapshot.
    connection.cursor().execute(f'CREATE TABLE {schema}.MATCHES AS SELECT * FROM CAFC_DB.APP_COMPAT.MATCHES')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file',required=True);p.add_argument('--schema',required=True)
    a=p.parse_args();isolated_schema(a.schema)
    c=connect(a.env_file)
    try:prepare(c,a.schema)
    finally:c.close()
