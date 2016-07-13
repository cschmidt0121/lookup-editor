import logging
import common
import os
import sys
import json
import re

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

class get_lookup_info_handler(splunk.rest.BaseRestHandler):

    def handle_GET(self):
        self.response.setHeader('content-type', 'application/json')
        lookup_file = self.args.get("lookup_file", None)
        namespace = self.args.get("namespace", "lookup_editor")
        session_key = self.sessionKey

        """
        Get information about a lookup file
        """

        logger.info("Retrieving information about a lookup file...")

        # Load defaults (cherrypy won't let me assign defaults in the function definition)
        owner = self.args.get("owner", None)
        version = self.args.get("version", None)

        # Ensure that the file name is valid
        if not common.is_file_name_valid(lookup_file):
            self.response.setStatus(400)
            logger.info("The lookup filename contains disallowed characters, lookup_name=%s", lookup_file)
            self.response.write("The lookup filename contains disallowed characters")
            return

        # Get a reference to the file
        full_lookup_filename = common.resolve_lookup_filename(lookup_file, namespace, owner, get_default_csv=True, version=version, session_key=session_key)

        # Below is the description of the file
        desc = {}

        # Fill out information about this file
        desc['filename'] = full_lookup_filename

        # Get the size of the file
        try:
            file_size = os.path.getsize(full_lookup_filename)
            desc['size'] = file_size
            desc['is_too_big_for_editing'] = (file_size > common.MAXIMUM_EDITABLE_SIZE)

        except os.error:
            self.response.setStatus(400)
            self.response.write("The lookup file could not be opened")
            return

        # Return the information
        self.response.write(json.dumps(desc))
        return
