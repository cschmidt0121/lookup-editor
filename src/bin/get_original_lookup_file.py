import logging
import common
import os
import sys
import json
import re
import csv

from splunk import AuthorizationFailed, ResourceNotFound
import splunk.rest
import splunk.appserver.mrsparkle.controllers as controllers
import splunk.appserver.mrsparkle.lib.util as util
import splunk.entity as entity
from splunk.appserver.mrsparkle.lib import jsonresponse
from splunk.appserver.mrsparkle.lib.util import make_splunkhome_path
from splunk.appserver.mrsparkle.lib.decorators import expose_page

bin_dir = os.path.join(util.get_apps_dir(), __file__.split('.')[-2], 'bin')

if not bin_dir in sys.path:
    sys.path.append(dir)

import lookupfiles

logger = common.setup_logger(logging.INFO)

from splunk.models.base import SplunkAppObjModel
from splunk.models.field import BoolField, Field

def convert_array_to_csv(array):

    output = StringIO.StringIO() #io.StringIO()

    writer = csv.writer(output)

    for row in array:
        writer.writerow(row)

    return output.getvalue()

class PermissionDeniedException(Exception):
    pass

class get_original_lookup_file_handler(splunk.rest.BaseRestHandler):
    def handle_GET(self):

        lookup_file = self.args.get("lookup_file", None)
        namespace = self.args.get("namespace", "lookup_editor")
        owner = self.args.get("owner", None)
        lookup_type = self.args.get("lookup_type", "csv")
        session_key = self.sessionKey
        """
        Provides the contents of a lookup file.
        """

        logger.info("Exporting lookup, namespace=%s, lookup=%s, type=%s, owner=%s", namespace, lookup_file, lookup_type, owner)

        try:

            # If we are getting the CSV, then just pipe the file to the user
            if lookup_type == "csv":
                with common.get_lookup(lookup_file, namespace, owner, session_key=session_key) as f:
                    csvData = f.read()

            # If we are getting a KV store lookup, then convert it to a CSV file
            else:
                rows = common.get_kv_lookup(lookup_file, namespace, None)

                csvData = convert_array_to_csv(rows)

            # Tell the browser to download this as a file
            if lookup_file.endswith(".csv"):
                self.response.setHeader('Content-Disposition', 'attachment; filename="%s' % lookup_file)
            else:
                self.response.setHeader('Content-Disposition', 'attachment; filename="%s' % lookup_file + '.csv')

            self.response.setHeader('Content-Type', 'text/csv')
            self.response.write(csvData)
            return

        except IOError:
            self.response.setStatus(404)
            self.response.write(json.dumps([]))
            return

        except PermissionDeniedException as e:
            self.response.setStatus(403)
            self.response.write(str(e))
            return
