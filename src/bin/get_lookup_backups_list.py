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

def getBackupFiles(lookup_file, namespace, owner, session_key):
    """
    Get a list of backup files for a given file
    """

    # Escape the file name so that we find the correct file
    escaped_filename = escapeFilename(lookup_file)

    # Get the backup directory and determine the path to the backups
    backup_directory = getBackupDirectory(escaped_filename, namespace, owner, session_key)

    # Get the backups
    backups = [ f for f in os.listdir(backup_directory) if os.path.isfile(os.path.join(backup_directory,f)) ]

    return backups

def escapeFilename(file_name):
    """
    Return a file name the excludes special characters (replaced with underscores)
    """

    return re.sub(r'[/\\?%*:|"<>]', r'_', file_name)

def getBackupDirectory(lookup_file, namespace, owner=None, resolved_lookup_path=None, session_key=None):
    """
    Get the backup directory where the lookup should be stored
    """

    if owner is None:
        owner = 'nobody'

    # Identify the current path of the given lookup file
    if resolved_lookup_path is None:
        resolved_lookup_path = lookupfiles.SplunkLookupTableFile.get(lookupfiles.SplunkLookupTableFile.build_id(lookup_file, namespace, owner), sessionKey=session_key).path

    # Determine what the backup directory should be
    backup_directory = make_splunkhome_path([os.path.dirname(resolved_lookup_path), "lookup_file_backups", namespace, owner, escapeFilename(lookup_file)])
    #backup_directory = make_splunkhome_path([os.path.split(resolved_lookup_path)[0], "lookup_file_backups", namespace, owner, self.escapeFilename(lookup_file)])

    # Make the backup directory, if necessary
    if not os.path.exists(backup_directory):
        os.makedirs(backup_directory)

    logger.debug("Backup directory is:" + backup_directory)

    return backup_directory

class get_lookup_backups_list_handler(splunk.rest.BaseRestHandler):

    def handle_GET(self):
        self.response.setHeader('content-type', 'application/json')
        lookup_file = self.args.get("lookup_file", None)
        namespace = self.args.get("namespace", "lookup_editor")
        owner = self.args.get("namespace", None)
        session_key = self.sessionKey
        backups = getBackupFiles(lookup_file, namespace, owner, session_key)

        # Make the response
        backups_meta = []

        for backup in backups:
            try:
                backups_meta.append(
                                    {
                                     'time': backup,
                                     'time_readable' : datetime.datetime.fromtimestamp(float(backup)).strftime('%Y-%m-%d %H:%M:%S')
                                    }
                                    )
            except ValueError:
                logger.warning("Backup file name is invalid, file_name=%s", backup)

        # Sort the list
        backups_meta = sorted(backups_meta, key=lambda x: float(x['time']), reverse=True)

        self.response.write(json.dumps(backups_meta))
        return
