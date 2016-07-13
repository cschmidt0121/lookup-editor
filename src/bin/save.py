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

def makeLookupFilename(lookup_file, namespace="lookup_editor", owner=None):
    """
    Create the file name of a lookup file. That is, device a path for where the file should exist.
    """

    # Strip out invalid characters like ".." so that this cannot be used to conduct an directory traversal
    lookup_file = os.path.basename(lookup_file)
    namespace = os.path.basename(namespace)

    if owner is not None:
        owner = os.path.basename(owner)

    # Get the user lookup
    if owner is not None and owner != 'nobody' and owner.strip() != '':
        return make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file])


    # Get the non-user lookup
    else:
        return make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file])

def getBackupDirectory(lookup_file, namespace, owner=None, resolved_lookup_path=None):
    """
    Get the backup directory where the lookup should be stored
    """

    if owner is None:
        owner = 'nobody'

    # Identify the current path of the given lookup file
    if resolved_lookup_path is None:
        resolved_lookup_path = lookupfiles.SplunkLookupTableFile.get(lookupfiles.SplunkLookupTableFile.build_id(lookup_file, namespace, owner)).path

    # Determine what the backup directory should be
    backup_directory = make_splunkhome_path([os.path.dirname(resolved_lookup_path), "lookup_file_backups", namespace, owner, self.escapeFilename(lookup_file)])
    #backup_directory = make_splunkhome_path([os.path.split(resolved_lookup_path)[0], "lookup_file_backups", namespace, owner, self.escapeFilename(lookup_file)])

    # Make the backup directory, if necessary
    if not os.path.exists(backup_directory):
        os.makedirs(backup_directory)

    logger.debug("Backup directory is:" + backup_directory)

    return backup_directory

def backupLookupFile(lookup_file, namespace, owner=None, resolved_file_path=None):
    """
    Make a backup if the lookup file
    """

    try:

        # If we don't already know the path of the file, then load it
        if resolved_file_path is None:
            resolved_file_path = resolve_lookup_filename(lookup_file, namespace, owner, throw_not_found=False)

        # If the file doesn't appear to exist yet. Then skip the backup.
        if resolved_file_path is None:
            logger.info("The file dosen't exist yet; the backup will not be made")
            return None

        # Get the backup directory
        backup_directory = getBackupDirectory(lookup_file, namespace, owner, resolved_lookup_path=resolved_file_path)

        # Get the date of the existing file so that we put the
        try:
            file_time = os.path.getmtime(resolved_file_path)
        except:
            logger.warning('Unable to get the file modification time for the existing lookup file="%s"', resolved_file_path)
            file_time = None

        # If we couldn't get the time, then just use the current time (the time we are making a backup)
        if file_time is None:
            file_time = time.time()

        # Make the full paths for the backup to be stored
        dst = make_splunkhome_path([backup_directory, str(file_time)])

        # Make the backup
        shutil.copyfile(resolved_file_path, dst)

        # Copy the permissions and timestamps
        shutil.copystat(resolved_file_path, dst)

        logger.info('A backup of the lookup file was created, namespace=%s, lookup_file="%s", backup_file="%s"', namespace, lookup_file, dst)

        # Return the path of the backup in case the caller wants to do something with it
        return dst
    except:
        logger.exception("Error when attempting to make a backup; the backup will not be made")

        return None

def isLookupInUsersPath(lookup_file_path):
    if "etc/users/" in lookup_file_path:
        return True
    else:
        return False

def force_lookup_replication(app, filename, sessionKey, base_uri=None):
    """
    Force replication of a lookup table in a Search Head Cluster.
    """

    # Permit override of base URI in order to target a remote server.
    endpoint = '/services/replication/configuration/lookup-update-notify'

    if base_uri:
        repl_uri = base_uri + endpoint
    else:
        repl_uri = endpoint

    # Provide the data that describes the lookup
    payload = {
               'app': app,
               'filename': os.path.basename(filename),
               'user': 'nobody'
    }

    # Perform the request
    response, content = splunk.rest.simpleRequest(repl_uri,
        method='POST',
        postargs=payload, sessionKey=sessionKey, raiseAllErrors=False)

    # Analyze the response
    if response.status == 400:
        if 'No local ConfRepo registered' in content:
            # search head clustering not enabled
            logger.info('Lookup table replication not applicable for %s: clustering not enabled', filename)
            return (True, response.status, content)
        elif 'Could not find lookup_table_file' in content:
            logger.error('Lookup table replication failed for %s: status_code="%s", content="%s"', filename, response.status, content)
            return (False, response.status, content)
        else:
            # Previously unforeseen 400 error.
            logger.error('Lookup table replication failed for %s: status_code="%s", content="%s"', filename, response.status, content)
            return (False, response.status, content)

    elif response.status != 200:
        return (False, response.status, content)

    # Return a default response
    logger.info('Lookup table replication forced for %s', filename)
    return (True, response.status, content)

def isEmpty(row):
    """
    Determines if the given row in a lookup is empty. This is done in order to prune rows that are empty.
    """

    for e in row:
        if e is not None and len(e.strip()) > 0:
            return False

    return True

class save_handler(splunk.rest.BaseRestHandler):

    def handle_POST(self):
        self.response.setHeader('content-type', 'application/json')
        lookup_file = self.args.get("lookup_file", None)
        contents = self.args.get("contents", None)
        namespace = self.args.get("namespace", "lookup_editor")
        owner = self.args.get("owner", None)
        session_key = self.sessionKey
        user = entity.getEntity("authentication/current-context", "context", count=1, sessionKey=session_key)["username"]
        """
        Save the contents of a lookup file
        """

        logger.info("Saving lookup contents...")

        try:

          if owner is None:
              owner = "nobody"

          if namespace is None:
              namespace = "lookup_editor"

          # Check capabilities
          common.check_capabilities(lookup_file, user, session_key)

          # Ensure that the file name is valid
          if not common.is_file_name_valid(lookup_file):
              self.response.setStatus(400)
              self.response.write("The lookup filename contains disallowed characters")
              return

          # Determine the final path of the file
          resolved_file_path = common.resolve_lookup_filename(lookup_file, namespace, owner, throw_not_found=False, session_key=session_key)

          # Make a backup
          backupLookupFile(lookup_file, namespace, owner)

          # Parse the JSON
          parsed_contents = json.loads(contents)

          # Create the temporary file
          temp_file_handle = lookupfiles.get_temporary_lookup_file()

          # This is a full path already; no need to call make_splunkhome_path().
          temp_file_name = temp_file_handle.name

          # Make the lookups directory if it does not exist
          destination_lookup_full_path = makeLookupFilename(lookup_file, namespace, owner)
          logger.debug("destination_lookup_full_path=%s", destination_lookup_full_path)
          destination_lookup_path_only, _ = os.path.split(destination_lookup_full_path)

          try:
              os.umask(0) # http://bytes.com/topic/python/answers/572176-os-mkdir-mode
              os.makedirs(destination_lookup_path_only, 0755)
          except OSError:
              # The directory already existed, no need to create it
              logger.debug("Destination path of lookup already existed, no need to create it; destination_lookup_path=%s", destination_lookup_path_only)

          # Write out the new file to a temporary location
          try:
              if temp_file_handle is not None and os.path.isfile(temp_file_name):

                  csv_writer = csv.writer(temp_file_handle, lineterminator='\n')

                  for row in parsed_contents:

                      if not isEmpty(row): # Prune empty rows
                          csv_writer.writerow( row )

          finally:
              if temp_file_handle is not None:
                  temp_file_handle.close()

          # Determine if the lookup file exists, create it if it doesn't
          if resolved_file_path is None:
              shutil.move(temp_file_name, destination_lookup_full_path)
              logger.info('Lookup created successfully, user=%s, namespace=%s, lookup_file=%s, path="%s"', user, namespace, lookup_file, destination_lookup_full_path)

              # If the file is new, then make sure that the list is reloaded so that the editors notice the change
              lookupfiles.SplunkLookupTableFile.reload(session_key=session_key)

          # Edit the existing lookup otherwise
          else:

              try:

                  if not isLookupInUsersPath(resolved_file_path) or owner == 'nobody':
                      lookupfiles.update_lookup_table(filename=temp_file_name, lookup_file=lookup_file, namespace=namespace, owner="nobody", key=session_key)
                  else:
                      lookupfiles.update_lookup_table(filename=temp_file_name, lookup_file=lookup_file, namespace=namespace, owner=owner, key=session_key)

              except AuthorizationFailed as e:
                  self.response.setStatus(403)
                  self.response.write(str(e))
                  return

              logger.info('Lookup edited successfully, user=%s, namespace=%s, lookup_file=%s', user, namespace, lookup_file)

          # Tell the SHC environment to replicate the file
          try:
              force_lookup_replication(namespace, lookup_file, session_key)
          except ResourceNotFound:
              logger.info("Unable to force replication of the lookup file to other search heads; upgrade Splunk to 6.2 or later in order to support CSV file replication")

        except:
          logger.exception("Unable to save the lookup")
          self.response.setStatus(500)
          self.response.write("Unable to save the lookup")
          return
