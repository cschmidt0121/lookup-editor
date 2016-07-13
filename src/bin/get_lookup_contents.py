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

class PermissionDeniedException(Exception):
    pass

"""
Represents an exception when the user requested a lookup file that was too big.
"""
class LookupFileTooBigException(Exception):
    def __init__(self, file_size):

        # Call the base class constructor with the parameters it needs
        super(LookupFileTooBigException, self).__init__("Lookup file is too large to be loaded")

        # Remember the file-size
        self.file_size = file_size

class get_lookup_contents_handler(splunk.rest.BaseRestHandler):
    def handle_GET(self):
        self.response.setHeader('content-type', 'application/json')
        lookup_file = self.args.get("lookup_file", None)
        namespace = self.args.get("namespace", "lookup_editor")
        owner = self.args.get("owner", None)
        header_only = self.args.get("header_only", False)
        version = self.args.get("version", None)
        lookup_type = self.args.get("lookup_type", None)
        session_key = self.sessionKey
        user = entity.getEntity("authentication/current-context", "context", count=1, sessionKey=session_key)["username"]

        """
        Provides the contents of a lookup file as JSON.
        """

        logger.info("Retrieving lookup contents, namespace=%s, lookup=%s, type=%s, owner=%s, version=%s", namespace, lookup_file, lookup_type, owner, version)

        if lookup_type is None or len(lookup_type) == 0:
            lookup_type = "csv"
            logger.warning("No type for the lookup provided when attempting to load a lookup file, it will default to CSV")

        if header_only in ["1", "true", 1, True]:
            header_only = True
        else:
            header_only = False

        try:

            # Load the KV store lookup
            if lookup_type == "kv":
                self.response.write(json.dumps(common.get_kv_lookup(lookup_file, namespace, owner, session_key)))
                return

            # Load the CSV lookup
            elif lookup_type == "csv":

                with common.get_lookup(lookup_file, namespace, owner, version=version, throw_exception_if_too_big=True, session_key=session_key, user=user) as csv_file:
                    csv_reader = csv.reader(csv_file)

                    # Convert the content to JSON
                    lookup_contents = []

                    for row in csv_reader:
                        lookup_contents.append(row)

                        # If we are only loading the header, then stop here
                        if header_only:
                            break

                    self.response.write(json.dumps(lookup_contents))
                    return

            else:
                self.response.setStatus(421)
                logger.warning('Lookup file type is not recognized, lookup_type=' + lookup_type)
                self.response.write('Lookup file type is not recognized')
                return

        except IOError:
            logger.warning("Unable to find the requested lookup")
            self.response.setStatus(404)
            self.response.write('Unable to find the lookup')
            return

        except PermissionDeniedException as e:
            logger.warning("Access to lookup denied")
            self.response.setStatus(403)
            self.response.write(str(e))
            return

        except LookupFileTooBigException as e:
            logger.warning("Lookup file is too large to load")
            self.response.setStatus(420)
            self.response.write(json.dumps({
                                     'message': 'Lookup file is too large to load (file-size must be less than 10 MB to be edited)',
                                     'file_size' : e.file_size
                                     }))
            return
        except Exception as e:
            logger.exception('Lookup file could not be loaded')
            self.response.setStatus(500)
            self.response.write('Lookup file could not be loaded: ' + str(e))
            return
