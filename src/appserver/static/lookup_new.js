require(["underscore","backbone","collections/SplunkDsBase","splunkjs/mvc","jquery"],function(a,f,b,e,d){var c=b.extend({url:"/servicesNS/nobody/lookup_editor/storage/collections/config?count=-1",initialize:function(){b.prototype.initialize.apply(this,arguments)}});kv_lookups=new c();kv_lookups.fetch({complete:function(g,h){if(g.status==404){d(".show-kv-supported-only").hide();d(".show-kv-unsupported-only").show()}}.bind(this)})});