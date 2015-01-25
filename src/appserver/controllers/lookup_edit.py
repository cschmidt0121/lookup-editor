import logging
import os
import sys
import json
import shutil
import csv
import cherrypy
import re
import time
import datetime

from splunk import AuthorizationFailed as AuthorizationFailed
import splunk.appserver.mrsparkle.controllers as controllers
import splunk.appserver.mrsparkle.lib.util as util
import splunk.bundle as bundle
import splunk.entity as entity
from splunk.appserver.mrsparkle.lib import jsonresponse
from splunk.appserver.mrsparkle.lib.util import make_splunkhome_path
import splunk.clilib.bundle_paths as bundle_paths
from splunk.util import normalizeBoolean as normBool
from splunk.appserver.mrsparkle.lib.decorators import expose_page
from splunk.appserver.mrsparkle.lib.routes import route

dir = os.path.join(util.get_apps_dir(), __file__.split('.')[-2], 'bin')

if not dir in sys.path:
    sys.path.append(dir)

import lookupfiles

# The default of the csv module is 128KB; upping to 10MB. See SPL-12117 for 
# the background on issues surrounding field sizes. 
# (this method is new in python 2.5) 
csv.field_size_limit(10485760)

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

logger = setup_logger(logging.DEBUG)

from splunk.models.base import SplunkAppObjModel
from splunk.models.field import BoolField, Field

"""
Represents an exception when the user did not have sufficient permissions.
"""
class PermissionDeniedException(Exception):
    pass

"""
Provides a model for retreiving the list of apps from Splunk.
"""
class App(SplunkAppObjModel):
    ''' Represents a Splunk app '''
    
    resource      = 'apps/local'
    is_disabled   = BoolField('disabled')
    is_configured = BoolField('configured')
    label         = Field()
    
def isEmpty( row ):
    """
    Determines if the given row in a lookup is empty. This is done in order to prune rows that are empty.
    """
    
    for e in row:
        if e is not None and len(e.strip()) > 0:
            return False
        
    return True

class LookupEditor(controllers.BaseController):
    '''
    Lookup Editor Controller
    '''
 
    MAXIMUM_EDITABLE_SIZE = 10 * 1024 * 1024 # 10 MB
 
    @staticmethod
    def getCapabilities4User(user=None, session_key=None):
        """
        Get the capabilities for the given user.
        """
        
        roles = []
        capabilities = []
        
        # Get user info              
        if user is not None:
            logger.info('Retrieving role(s) for current user: %s' % (user))
            userDict = entity.getEntities('authentication/users/%s' % (user), count=-1, sessionKey=session_key)
        
            for stanza, settings in userDict.items():
                if stanza == user:
                    for key, val in settings.items():
                        if key == 'roles':
                            logger.info('Successfully retrieved role(s) for user: %s' % (user))
                            roles = val
             
        # Get capabilities
        for role in roles:
            logger.info('Retrieving capabilities for current user: %s' % (user))
            roleDict = entity.getEntities('authorization/roles/%s' % (role), count=-1, sessionKey=session_key)
            
            for stanza, settings in roleDict.items():
                if stanza == role:
                    for key, val in settings.items():
                        if key == 'capabilities' or key =='imported_capabilities':
                            logger.info('Successfully retrieved %s for user: %s' % (key, user))
                            capabilities.extend(val)
            
        return capabilities     
    
    @expose_page(must_login=True, methods=['GET']) 
    def get_lookup_info(self, lookup_file, namespace="lookup_editor", **kwargs):
        """
        Get information about a lookup file
        """

        logger.info("Retrieving information about a lookup file...")
        
        user = cherrypy.session['user']['name']
        session_key = cherrypy.session.get('sessionKey')
        
        # Load defaults (cherrypy won't let me assign defaults in the function definition)
        owner = kwargs.get('owner', None)
        version = kwargs.get('version', None)
        
        # Ensure that the file name is valid
        if not self.is_file_name_valid(lookup_file):
            cherrypy.response.status = 400
            return self.render_error_json(_("The lookup filename contains disallowed characters"))
        
        # Get a reference to the file
        full_lookup_filename = self.resolve_lookup_filename(lookup_file, namespace, owner, get_default_csv=True, version=version)
        
        # Below is the description of the file
        desc = {}
        
        # Fill out information about this file
        desc['filename'] = full_lookup_filename
        
        # Get the size of the file
        try:
            file_size = os.path.getsize(full_lookup_filename)
            desc['size'] = file_size
            desc['is_too_big_for_editing'] = (file_size > LookupEditor.MAXIMUM_EDITABLE_SIZE)
            
        except os.error:
            cherrypy.response.status = 400
            return self.render_error_json(_("The lookup file could not be opened"))
        
        # Return the information
        return self.render_json(desc)
        
        
    def is_file_name_valid(self, lookup_file):     
        """
        Indicate if the lookup file is valid (doesn't contain invalid characters such as "..").
        """
         
        allowed_path = re.compile("^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$", re.IGNORECASE)
        
        if not allowed_path.match(lookup_file):
            return False
        else:
            return True
        
    def getBackupFiles(self, lookup_file, namespace, owner):
        """
        Get a list of backup files for a given file
        """
        
        # Escape the file name so that we find the correct file
        escaped_filename = self.escapeFilename(lookup_file)
        
        # Get the backup directory and determine the path to the backups
        backup_directory = self.getBackupDirectory(lookup_file, namespace, owner)
        logger.info("")
        
        # Get the backups
        backups = [ f for f in os.listdir(backup_directory) if os.path.isfile(os.path.join(backup_directory,f)) ]
        
        return backups
    
    @expose_page(must_login=True, methods=['GET']) 
    def get_lookup_backups_list(self, lookup_file, namespace, owner=None, **kwargs):
        
        backups = self.getBackupFiles(lookup_file, namespace, owner)
        
        # Make the response
        backups_meta = []
        
        for backup in backups:
            backups_meta.append(
                                {
                                 'time': backup,
                                 'time_readable' : datetime.datetime.fromtimestamp(float(backup)).strftime('%Y-%m-%d %H:%M:%S')
                                }
                                )
        
        # Sort the list
        backups_meta = sorted(backups_meta, key=lambda x: float(x['time']), reverse=True)
        
        return self.render_json(backups_meta)
        
    def escapeFilename(self, file_name):
        """
        Return a file name the excludes special characters (replaced with underscores)
        """
        
        return re.sub(r'[/\\?%*:|"<>]', r'_', file_name)
    
    def getBackupDirectory(self, lookup_file, namespace, owner=None):
        """
        Get the backup directory where the lookup should be stored
        """
        
        if owner is None:
            owner = 'nobody'
        
        # Identify the current path of the given lookup file
        resolved_lookup_path = lookupfiles.SplunkLookupTableFile.get(lookupfiles.SplunkLookupTableFile.build_id(lookup_file, namespace, owner)).path
        
        # Determine what the backup directory should be
        backup_directory = make_splunkhome_path([os.path.dirname(resolved_lookup_path), "lookup_file_backups", namespace, owner, self.escapeFilename(lookup_file)])
        #backup_directory = make_splunkhome_path(['etc', 'apps', 'lookup_editor', 'lookup_file_backups', namespace, owner, self.escapeFilename(lookup_file)])
        
        # Make the backup directory, if necessary
        if not os.path.exists(backup_directory):
            os.makedirs(backup_directory)
        
        logger.debug("Backup directory is:" + backup_directory)
            
        return backup_directory
                
    def backupLookupFile(self, lookup_file, namespace, owner=None):
        """
        Make a backup if the lookup file
        """
        
        try:
            # Get the backup directory
            backup_directory = self.getBackupDirectory(lookup_file, namespace, owner)
            
            # Make the full paths
            src = self.resolve_lookup_filename(lookup_file, namespace, owner)
            dst = make_splunkhome_path([backup_directory, str(time.time())])
    
            # Make the backup
            shutil.copyfile(src, dst)
            
            # Copy the permissions and timestamps
            shutil.copystat(src, dst)
            
            logger.info('A backup of the lookup file was created, namespace=%s, lookup_file="%s", backup_file="%s"', namespace, lookup_file, dst)
            
            # Return the path of the backup in case the caller wants to do something with it
            return dst
        except:
            logger.exception("Error when attempting to make a backup; the backup will not be made")
            
            return None
        
    @expose_page(must_login=True, methods=['POST']) 
    def save(self, lookup_file, contents, namespace, **kwargs):
        """
        Save the contents of a lookup file
        """

        logger.info("Saving lookup contents...")

        user = cherrypy.session['user']['name']
        session_key = cherrypy.session.get('sessionKey')
        owner = kwargs.get("owner", "nobody")
        
        # Get capabilities
        capabilities = LookupEditor.getCapabilities4User(user, session_key)
        
        # Check capabilities
        LookupEditor.check_capabilities(lookup_file, user, session_key)
        
        # Ensure that the file name is valid
        if not self.is_file_name_valid(lookup_file):
            cherrypy.response.status = 400
            return self.render_error_json(_("The lookup filename contains disallowed characters"))
        
        # Make a backup
        self.backupLookupFile(lookup_file, namespace, owner)
        
        # Parse the JSON
        parsed_contents = json.loads(contents)
        
        # Create the temporary file
        temp_file_handle = lookupfiles.get_temporary_lookup_file()
        
        # This is a full path already; no need to call make_splunkhome_path().
        temp_file_name = temp_file_handle.name
        destination_full_path = make_splunkhome_path(['etc', 'apps', namespace, 'lookups', lookup_file])
        
        # Make the lookups directory if it does not exist
        destination_lookups_path = make_splunkhome_path(['etc', 'apps', namespace, 'lookups'])
        try:
            os.umask(0) # http://bytes.com/topic/python/answers/572176-os-mkdir-mode
            os.mkdir(destination_lookups_path, 0755)
        except OSError:
            # The directory already existed, no need to create it
            pass
        
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
        if not os.path.exists(destination_full_path):
            shutil.move(temp_file_name, destination_full_path)
            logger.info('Lookup created successfully, user=%s, namespace=%s, lookup_file=%s', user, namespace, lookup_file)
            
            # If the file is new, then make sure that the list is reloaded so that the editors notice the change
            lookupfiles.SplunkLookupTableFile.reload(session_key=session_key)
            
        # Edit the existing lookup otherwise
        else:
            
            if "owner" in kwargs:
                owner = kwargs["owner"]
            else:
                owner = "nobody"
            
            try:
                lookupfiles.update_lookup_table(filename=temp_file_name, lookup_file=lookup_file, namespace=namespace, owner=owner, key=session_key)
            except AuthorizationFailed as e:
                cherrypy.response.status = 403
                return self.render_error_json(_(str(e)))
                
            logger.info('Lookup edited successfully, user=%s, namespace=%s, lookup_file=%s', user, namespace, lookup_file)
     
    def render_error_json(self, msg):
        output = jsonresponse.JsonResponse()
        output.data = []
        output.success = False
        output.addError(msg)
        return self.render_json(output, set_mime='text/plain')
    
    @expose_page(must_login=True, methods=['GET']) 
    def get_original_lookup_file(self, lookup_file, namespace="lookup_editor", **kwargs):
        """
        Provides the contents of a lookup file.
        """
    
        try:
            
            with self.get_lookup( lookup_file, namespace, None ) as f:
                csvData = f.read()
            
            cherrypy.response.headers['Content-Disposition'] = 'attachment; filename="%s"' % lookup_file
            cherrypy.response.headers['Content-Type'] = 'text/csv'
            return csvData
            
        except IOError:
            cherrypy.response.status = 404
            return self.render_json([])
        
        except PermissionDeniedException as e:
            cherrypy.response.status = 403
            return self.render_error_json(_(str(e)))
    
    @classmethod
    def check_capabilities(cls, lookup_file, user, session_key ):
        
        # Get the user's name and session
        user = cherrypy.session['user']['name'] 
        session_key = cherrypy.session.get('sessionKey')
        
        # Get capabilities
        capabilities = LookupEditor.getCapabilities4User(user, session_key)
        
        # Check capabilities
        if False:
            raise PermissionDeniedException(signature)
    
    def resolve_lookup_filename(self, lookup_file, namespace="lookup_editor", owner=None, get_default_csv=True, version=None):
        """
        Resolve the lookup filename.
        """
        
        # Strip out invalid characters like ".."
        lookup_file = os.path.basename(lookup_file)
        namespace = os.path.basename(namespace)
        
        if owner is not None:
            owner = os.path.basename(owner)
        
        # Determine the lookup path by asking Splunk
        resolved_lookup_path = lookupfiles.SplunkLookupTableFile.get(lookupfiles.SplunkLookupTableFile.build_id(lookup_file, namespace, owner)).path
        
        if version is not None and owner is not None:
            lookup_path = make_splunkhome_path([self.getBackupDirectory(lookup_file, namespace, owner), version])
            lookup_path_default = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file + ".default"])
        elif version is not None:
            lookup_path = make_splunkhome_path([self.getBackupDirectory(lookup_file, namespace, owner), version])
            lookup_path_default = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file + ".default"])
        elif owner is not None:
            # e.g. $SPLUNK_HOME/etc/users/luke/SA-NetworkProtection/lookups/test.csv
            lookup_path = resolved_lookup_path
            #lookup_path = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file])
            lookup_path_default = make_splunkhome_path(["etc", "users", owner, namespace, "lookups", lookup_file + ".default"])
        else:
            lookup_path = resolved_lookup_path
            #lookup_path = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file])
            lookup_path_default = make_splunkhome_path(["etc", "apps", namespace, "lookups", lookup_file + ".default"])
            
        logger.debug('Resolved lookup file, file=%s', lookup_path)
            
        # Get the file path
        if get_default_csv and not os.path.exists(lookup_path) and os.path.exists(lookup_path_default):
            return lookup_path_default
        else:
            return lookup_path
            
    def get_lookup(self, lookup_file, namespace="lookup_editor", owner=None, get_default_csv=True, version=None):
        """
        Get a file handle to the associated lookup file.
        """
        
        logger.info("Retrieving lookup file contents...")
        logger.debug("Version is:" + str(version))
        # Get the user's name and session
        user = cherrypy.session['user']['name'] 
        session_key = cherrypy.session.get('sessionKey')
        
        # Check capabilities
        LookupEditor.check_capabilities(lookup_file, user, session_key)
        
        # Get the file handle
        return open(self.resolve_lookup_filename(lookup_file, namespace, owner, get_default_csv, version), 'rb')

    @expose_page(must_login=True, methods=['GET']) 
    def get_lookup_contents(self, lookup_file, namespace="lookup_editor", owner=None, header_only=False, version=None, **kwargs):
        """
        Provides the contents of a lookup file as JSON.
        """
        
        if header_only in ["1", "true", 1, True]:
            header_only = True
        else:
            header_only = False
        
        try:
            with self.get_lookup(lookup_file, namespace, owner, version=version) as csv_file:
                
                csv_reader = csv.reader(csv_file)
            
                # Convert the content to JSON
                lookup_contents = []
                
                for row in csv_reader:
                    lookup_contents.append(row)
                    
                    # If we are only loading the header, then stop here
                    if header_only:
                        break
                
                return self.render_json(lookup_contents)
            
        except IOError:
            cherrypy.response.status = 404
            return self.render_json([])
        
        except PermissionDeniedException as e:
            cherrypy.response.status = 403
            return self.render_error_json(_(str(e)))
        
    @expose_page(must_login=True, methods=['GET']) 
    def get_lookup_header(self, lookup_file, namespace="lookup_editor", owner=None, **kwargs):
        pass