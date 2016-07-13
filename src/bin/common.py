import logging
from splunk.appserver.mrsparkle.lib.util import make_splunkhome_path
from splunk import ResourceNotFound
import lookupfiles
import os
import re

MAXIMUM_EDITABLE_SIZE = 10 * 1024 * 1024 # 10 MB

def setup_logger(level):
    """
    Setup a logger for the REST handler.
    """

    logger = logging.getLogger('splunk.appserver.lookup_editor.controllers.LookupEditor')
    logger.propagate = False # Prevent the log messages from being duplicated in the python.log file
    logger.setLevel(level)

    file_handler = logging.handlers.RotatingFileHandler(make_splunkhome_path(['var', 'log', 'splunk', 'lookup_editor_controller.log']), maxBytes=25000000, backupCount=5)

    formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger

logger = setup_logger(logging.INFO)

def get_lookup(lookup_file, namespace="lookup_editor", owner=None, get_default_csv=True, version=None, throw_exception_if_too_big=False, user=None, session_key=None):
    """
    Get a file handle to the associated lookup file.
    """
    logger.debug("Version is:" + str(version))

    # Check capabilities
    check_capabilities(lookup_file, user, session_key)

    # Get the file path
    file_path = resolve_lookup_filename(lookup_file, namespace, owner, get_default_csv, version, session_key=session_key)

    if throw_exception_if_too_big:

        try:
            file_size = os.path.getsize(file_path)
            logger.info('Size of lookup file determined, file_size=%s, path=%s', file_size, file_path)
            if file_size > MAXIMUM_EDITABLE_SIZE:
                raise LookupFileTooBigException(file_size)

        except os.error:
            logger.exception("Exception generated when attempting to determine size of requested lookup file")

    logger.info("Loading lookup file from path=%s", file_path)

    # Get the file handle
    return open(file_path, 'rb')

def get_kv_lookup(self, lookup_file, namespace="lookup_editor", owner=None, session_key=None):
    """
    Get the contents of a KV store lookup.
    """

    try:

        if owner is None:
            owner = 'nobody'

        lookup_contents = []

        # Get the fields so that we can compose the header
        _, content = splunk.rest.simpleRequest('/servicesNS/nobody/' + namespace + '/storage/collections/config/' + lookup_file, sessionKey=session_key, getargs={'output_mode': 'json'})
        header = json.loads(content)

        fields = ['_key']

        for field in header['entry'][0]['content']:
            if field.startswith('field.'):
                fields.append(field[6:])

        lookup_contents.append(fields)

        # Get the contents
        _, content = splunk.rest.simpleRequest('/servicesNS/' + owner + '/' + namespace + '/storage/collections/data/' + lookup_file, sessionKey=session_key, getargs={'output_mode': 'json'})

        rows = json.loads(content)

        for row in rows:
            new_row = []

            flattened_row = self.flatten_dict(row)

            for field in fields:
                if field in flattened_row:
                    new_row.append(flattened_row[field])

            lookup_contents.append(new_row)

        return lookup_contents

    except:
        logger.exception("KV store lookup could not be loaded")

def resolve_lookup_filename(lookup_file, namespace="lookup_editor", owner=None, get_default_csv=True, version=None, throw_not_found=True, session_key=None):
    """
    Resolve the lookup filename. This function will handle things such as:
     * Returning the default lookup file if requested
     * Returning the path to a particular version of a file

    Note that the lookup file must have an existing lookup file entry for this to return correctly; this shouldn't be used for determining the path of a new file.
    """

    # Strip out invalid characters like ".." so that this cannot be used to conduct an directory traversal
    lookup_file = os.path.basename(lookup_file)
    namespace = os.path.basename(namespace)

    if owner is not None:
        owner = os.path.basename(owner)

    # Determine the lookup path by asking Splunk
    try:
        resolved_lookup_path = lookupfiles.SplunkLookupTableFile.get(lookupfiles.SplunkLookupTableFile.build_id(lookup_file, namespace, owner), sessionKey=session_key).path
    except ResourceNotFound:
        if throw_not_found:
            raise
        else:
            return None

    # Get the backup file for one without an owner
    if version is not None and owner is not None:
        lookup_path = make_splunkhome_path([getBackupDirectory(lookup_file, namespace, owner, resolved_lookup_path=resolved_lookup_path), version])
        lookup_path_default = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file + ".default"])

    # Get the backup file for one with an owner
    elif version is not None:
        lookup_path = make_splunkhome_path([getBackupDirectory(lookup_file, namespace, owner, resolved_lookup_path=resolved_lookup_path), version])
        lookup_path_default = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file + ".default"])

    # Get the user lookup
    elif owner is not None and owner != 'nobody':
        # e.g. $SPLUNK_HOME/etc/users/luke/SA-NetworkProtection/lookups/test.csv
        lookup_path = resolved_lookup_path
        #lookup_path = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file])
        lookup_path_default = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file + ".default"])

    # Get the non-user lookup
    else:
        lookup_path = resolved_lookup_path
        #lookup_path = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file])
        lookup_path_default = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file + ".default"])

    logger.info('Resolved lookup file, path=%s', lookup_path)

    # Get the file path
    if get_default_csv and not os.path.exists(lookup_path) and os.path.exists(lookup_path_default):
        return lookup_path_default
    else:
        return lookup_path

def check_capabilities(lookup_file, user, session_key ):
    return

def is_file_name_valid(lookup_file):
    """
    Indicate if the lookup file is valid (doesn't contain invalid characters such as "..").
    """
    allowed_path = re.compile("^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$", re.IGNORECASE)

    if not allowed_path.match(lookup_file):
        return False
    else:
        return True
